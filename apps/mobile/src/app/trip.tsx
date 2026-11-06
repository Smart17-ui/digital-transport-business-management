import { isOffRoute, offRouteCount, routeProgress, turnAnnouncement, type NavRoute, type SpokenStage } from '@dt/domain';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '@/components/form';
import { Icon } from '@/components/icons';
import { openDirections } from '@/components/home-parts';
import { MapWebView, type MapHandle } from '@/components/map-web-view';
import { navMapHtml } from '@/components/nav-map-html';
import { Text, TextInput } from '@/components/text';
import { Button, Card, ListRow, Note } from '@/components/ui';
import {
  fetchRoutes,
  formatDistance,
  formatDuration,
  recentPlaces,
  rememberPlace,
  say,
  searchPlaces,
  setVoiceOn,
  stopSpeaking,
  useVoiceOn,
  type Place,
} from '@/lib/navigation';
import { colors, radius, space, TAP_TARGET, themedStyles, type, useThemeMode } from '@/lib/theme';

type Stage = 'choose' | 'preview' | 'driving' | 'arrived';

interface Here {
  latitude: number;
  longitude: number;
  heading: number | null;
  accuracyM: number | null;
  speedKmh: number;
}

/** Fast enough that the driver must not be typing. */
const MOVING_KMH = 15;
const SEARCH_DELAY_MS = 400;
/** A new route at most this often, so a wrong turn does not hammer a free service. */
const REROUTE_EVERY_MS = 15_000;

function KeepScreenOn() {
  useKeepAwake();
  return null;
}

function VoiceButton() {
  const voiceOn = useVoiceOn();
  return (
    <Pressable
      onPress={() => setVoiceOn(!voiceOn)}
      accessibilityRole="switch"
      accessibilityState={{ checked: voiceOn }}
      accessibilityLabel="Spoken directions"
      style={[styles.voice, voiceOn && styles.voiceOn]}
    >
      <Icon name={voiceOn ? 'volume' : 'volumeOff'} size={22} color={voiceOn ? colors.primaryText : colors.text} />
    </Pressable>
  );
}

export default function Trip() {
  const insets = useSafeAreaInsets();
  const { dark } = useThemeMode();
  const web = useRef<MapHandle>(null);
  const html = useMemo(() => navMapHtml(dark), [dark]);
  const [mapReady, setMapReady] = useState(false);

  const [stage, setStage] = useState<Stage>('choose');
  const [here, setHere] = useState<Here | null>(null);
  const [locationFailed, setLocationFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [routes, setRoutes] = useState<NavRoute[]>([]);
  const [chosen, setChosen] = useState(0);
  const recents = useMemo(() => recentPlaces(), []);

  const route = routes[chosen] ?? null;
  const moving = (here?.speedKmh ?? 0) >= MOVING_KMH;
  const run = (script: string) => web.current?.injectJavaScript(`${script}; true;`);

  // The phone's location, from the moment the screen opens: this is the origin.
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let closed = false;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          setLocationFailed(true);
          return;
        }
        const watching = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          ({ coords }) =>
            setHere({
              latitude: coords.latitude,
              longitude: coords.longitude,
              heading: coords.heading === null || coords.heading < 0 ? null : coords.heading,
              accuracyM: coords.accuracy,
              speedKmh: coords.speed === null || coords.speed < 0 ? 0 : coords.speed * 3.6,
            }),
        );
        if (closed) watching.remove();
        else subscription = watching;
      } catch {
        setLocationFailed(true);
      }
    })();
    return () => {
      closed = true;
      subscription?.remove();
      stopSpeaking();
    };
  }, []);

  // Places as the driver types, once they pause.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(text, here)
        .then((found) => {
          if (current) {
            setResults(found);
            setProblem(null);
          }
        })
        .catch(() => {
          if (current) setProblem('Could not search. Check your signal and try again.');
        })
        .finally(() => {
          if (current) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // Only a change of words searches again, not each new location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const choosePlace = async (next: Place) => {
    if (!here) return;
    setProblem(null);
    setPlace(next);
    setSearching(true);
    try {
      const found = await fetchRoutes(here, next);
      if (found.length === 0) {
        setProblem('We could not find a road to that place. Try somewhere close to it.');
        setPlace(null);
        return;
      }
      rememberPlace(next);
      setRoutes(found);
      setChosen(0);
      setStage('preview');
    } catch {
      setProblem('Could not get a route. Check your signal and try again.');
      setPlace(null);
    } finally {
      setSearching(false);
    }
  };

  // Keeping the map in step with the screen.
  useEffect(() => {
    if (mapReady && here) run(`window.setCar(${JSON.stringify([here.longitude, here.latitude])}, ${JSON.stringify(here.heading)})`);
  }, [mapReady, here]);

  useEffect(() => {
    if (!mapReady) return;
    run(`window.setRoutes(${JSON.stringify(routes.map((r) => r.geometry))}, ${chosen})`);
    run(`window.setPlace(${JSON.stringify(place ? [place.longitude, place.latitude] : null)})`);
  }, [mapReady, routes, chosen, place]);

  useEffect(() => {
    if (mapReady && stage === 'preview' && route) run(`window.showAll(${JSON.stringify(route.geometry)})`);
    // Fits once per route chosen, not each time a new location arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, stage, chosen, routes]);

  // Guidance: where the vehicle is on the route, what comes next, and whether it has left the route.
  const along = useRef(0);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const rerouting = useRef(false);
  const spoken = useRef<{ instruction: string | null; stage: SpokenStage }>({ instruction: null, stage: 'none' });
  const [noSignal, setNoSignal] = useState(false);

  const progress = stage === 'driving' && route && here ? routeProgress(route, here.latitude, here.longitude, along.current) : null;

  useEffect(() => {
    if (stage !== 'driving' || !progress || !here || !route || !place) return;
    along.current = progress.alongM;
    run(`window.follow(${JSON.stringify([here.longitude, here.latitude])}, ${JSON.stringify(here.heading)})`);

    if (progress.arrived) {
      setStage('arrived');
      say('You have arrived.');
      return;
    }

    const instruction = progress.nextStep?.instruction ?? null;
    if (instruction !== spoken.current.instruction) spoken.current = { instruction, stage: 'none' };
    if (instruction) {
      const announcement = turnAnnouncement(instruction, progress.toNextStepM, spoken.current.stage);
      if (announcement) {
        spoken.current.stage = announcement.spoken;
        say(announcement.text);
      }
    }

    offCount.current = offRouteCount(offCount.current, progress.offRouteM, here.accuracyM);
    if (isOffRoute(offCount.current) && !rerouting.current && Date.now() - lastReroute.current >= REROUTE_EVERY_MS) {
      rerouting.current = true;
      lastReroute.current = Date.now();
      fetchRoutes(here, place)
        .then(([next]) => {
          setNoSignal(false);
          if (!next) return;
          along.current = 0;
          offCount.current = 0;
          spoken.current = { instruction: null, stage: 'none' };
          setRoutes([next]);
          setChosen(0);
          say('Finding a new route.');
        })
        .catch(() => setNoSignal(true))
        .finally(() => {
          rerouting.current = false;
        });
    }
    // Runs for each new location, which is what `here` is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, here, route]);

  const go = () => {
    along.current = 0;
    offCount.current = 0;
    spoken.current = { instruction: null, stage: 'none' };
    setRoutes(route ? [route] : []);
    setChosen(0);
    setStage('driving');
    if (route?.steps[0]) say(route.steps[0].instruction);
  };

  const startAgain = () => {
    stopSpeaking();
    run('map.easeTo({ pitch: 0, bearing: 0, zoom: 14, offset: [0, 0] })');
    setRoutes([]);
    setChosen(0);
    setPlace(null);
    setQuery('');
    setResults(null);
    setProblem(null);
    setStage('choose');
  };

  const list = results ?? (query.trim().length < 3 ? recents : []);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Trip', headerShown: stage !== 'driving' }} />
      {stage === 'driving' ? <KeepScreenOn /> : null}

      {stage === 'driving' && progress ? (
        <View style={[styles.banner, { paddingTop: insets.top + space(3) }]}>
          <Text style={styles.bannerDistance}>{formatDistance(progress.toNextStepM)}</Text>
          <Text style={styles.bannerInstruction} numberOfLines={2}>
            {progress.nextStep?.instruction ?? 'Continue to your destination'}
          </Text>
          {noSignal ? <Text style={styles.bannerNote}>No signal. The route will update when you have signal.</Text> : null}
        </View>
      ) : null}

      {stage === 'choose' ? (
        <View style={styles.search}>
          <View style={styles.from}>
            <View style={styles.fromDot} />
            <Text style={styles.fromText} numberOfLines={1}>
              {locationFailed ? 'Location is off' : here ? 'Your location' : 'Finding your location...'}
            </Text>
          </View>
          <TextInput
            style={[styles.input, moving && styles.inputOff]}
            value={query}
            onChangeText={setQuery}
            editable={!moving}
            placeholder={moving ? 'Stop the bus to type' : 'Where to?'}
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            accessibilityLabel="Destination"
          />
          {problem ? (
            <Text style={styles.error} accessibilityRole="alert">
              {problem}
            </Text>
          ) : null}
          {locationFailed ? <Note>Allow location for this app to get directions.</Note> : null}
          {results?.length === 0 && !searching ? <Text style={styles.empty}>No places found. Try another name.</Text> : null}
          {list.length > 0 ? (
            <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
              <Card style={styles.list}>
                {list.map((item, i) => (
                  <ListRow
                    key={`${item.name}|${item.detail}`}
                    first={i === 0}
                    title={item.name}
                    detail={item.detail || undefined}
                    onPress={here ? () => void choosePlace(item) : undefined}
                  />
                ))}
              </Card>
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      <View style={styles.map}>
        <MapWebView
          html={html}
          web={web}
          failedText="The map could not load. Check your signal and try again."
          onReady={() => setMapReady(true)}
          onMessage={(message) => {
            if (message.type === 'route' && typeof message.index === 'number' && stage === 'preview') setChosen(message.index);
          }}
        />
      </View>

      {stage === 'preview' && place ? (
        <ScrollView style={styles.panel} contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + space(3) }]}>
          <Text style={styles.panelTitle} numberOfLines={1}>
            To {place.name}
          </Text>
          <View accessibilityRole="radiogroup">
            {routes.map((option, i) => (
              <OptionCard
                key={i}
                title={`${formatDuration(option.durationS)} · ${formatDistance(option.distanceM)}`}
                detail={option.summary ? `Via ${option.summary}` : 'Route ' + (i + 1)}
                selected={i === chosen}
                onPress={() => setChosen(i)}
              />
            ))}
          </View>
          <Text style={styles.small}>Times do not include traffic.</Text>
          <View style={styles.actions}>
            <Button label="Go" onPress={go} />
            <Button variant="secondary" label="See traffic in Google Maps" onPress={() => openDirections(place)} />
            <Button variant="secondary" label="Change destination" onPress={startAgain} />
          </View>
        </ScrollView>
      ) : null}

      {stage === 'driving' && progress ? (
        <View style={[styles.driveBar, { paddingBottom: insets.bottom + space(3) }]}>
          <View style={styles.flex}>
            <Text style={styles.driveTime}>{formatDuration(progress.remainingS)}</Text>
            <Text style={styles.small}>{formatDistance(progress.remainingM)} left</Text>
          </View>
          <VoiceButton />
          <Button compact variant="secondary" label="End trip" onPress={startAgain} />
        </View>
      ) : null}

      {stage === 'arrived' && place ? (
        <View style={[styles.panelContent, styles.arrived, { paddingBottom: insets.bottom + space(3) }]}>
          <Text style={styles.panelTitle}>You have arrived</Text>
          <Text style={styles.small}>{place.name}</Text>
          <View style={styles.actions}>
            <Button label="New trip" onPress={startAgain} />
            <Button variant="secondary" label="Back to my day" onPress={() => router.back()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1, minHeight: 160 },
  search: { padding: space(4), backgroundColor: colors.surface, maxHeight: '60%' },
  from: { flexDirection: 'row', alignItems: 'center', gap: space(2.5), marginBottom: space(3) },
  fromDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  fromText: { ...type.body, flex: 1, color: colors.text },
  input: {
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.control,
    paddingHorizontal: space(3.5),
    fontSize: 16,
    color: colors.text,
  },
  inputOff: { backgroundColor: colors.tint },
  error: { ...type.small, color: colors.owes, marginTop: space(2) },
  empty: { ...type.small, color: colors.muted, marginTop: space(3) },
  results: { marginTop: space(3) },
  list: { padding: 0, overflow: 'hidden' },
  panel: { flexGrow: 0, maxHeight: '55%', backgroundColor: colors.surface },
  panelContent: { padding: space(4), backgroundColor: colors.surface },
  panelTitle: { ...type.title, color: colors.text, marginBottom: space(3) },
  small: { ...type.small, color: colors.muted },
  actions: { gap: space(2), marginTop: space(3) },
  arrived: { gap: space(1) },
  banner: { paddingHorizontal: space(4), paddingBottom: space(4), backgroundColor: colors.hero },
  bannerDistance: { ...type.display, color: colors.primary },
  bannerInstruction: { ...type.title, color: colors.onDark, marginTop: space(1) },
  bannerNote: { ...type.small, color: colors.onDarkMuted, marginTop: space(2) },
  driveBar: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingTop: space(3), backgroundColor: colors.surface },
  driveTime: { ...type.title, color: colors.text },
  voice: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.tint,
  },
  voiceOn: { backgroundColor: colors.primary },
}));

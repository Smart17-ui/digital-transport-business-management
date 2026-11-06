import { useEffect, useMemo, useRef, useState } from 'react';
import { busMapHtml } from '@/components/bus-map-html';
import { MapWebView, type MapHandle } from '@/components/map-web-view';
import { useThemeMode } from '@/lib/theme';

export interface MapBus {
  id: string;
  plate: string;
  latitude: number;
  longitude: number;
  /** False when the position is old or the day is over, so it is drawn grey. */
  live: boolean;
}

export function BusMap(props: { buses: MapBus[]; chosen: string | null; onChoose: (id: string) => void }) {
  const { dark } = useThemeMode();
  const web = useRef<MapHandle>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => busMapHtml(dark), [dark]);

  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.setBuses(${JSON.stringify(props.buses)}, ${JSON.stringify(props.chosen)}); true;`);
  }, [ready, props.buses, props.chosen]);

  const chosenBus = props.buses.find((bus) => bus.id === props.chosen);
  useEffect(() => {
    if (ready && chosenBus) web.current?.injectJavaScript(`window.showBus(${chosenBus.longitude}, ${chosenBus.latitude}); true;`);
    // Moves only when a different bus is chosen, not each time that bus reports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, chosenBus?.id]);

  return (
    <MapWebView
      html={html}
      web={web}
      failedText="The map could not load. Check your signal. Your buses are still listed below."
      onReady={() => setReady(true)}
      onMessage={(message) => {
        if (message.type === 'bus' && message.id) props.onChoose(message.id);
      }}
    />
  );
}

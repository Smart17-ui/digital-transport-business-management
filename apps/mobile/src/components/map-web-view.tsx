import { useState, type ComponentType, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView as NativeWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { Text } from '@/components/text';
import { colors, space, themedStyles, type } from '@/lib/theme';

export interface MapHandle {
  injectJavaScript: (script: string) => void;
}

export interface MapMessage {
  type: string;
  id?: string;
  index?: number;
}

const BASE_URL = 'https://digitaltransport.zm/';

// The library's own class type does not fit React 19's types.
const WebView = NativeWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<MapHandle> }>;

export function MapWebView(props: { html: string; web: Ref<MapHandle>; failedText: string; onReady: () => void; onMessage?: (message: MapMessage) => void }) {
  const [failed, setFailed] = useState(false);

  const onMessage = (event: WebViewMessageEvent) => {
    const message = JSON.parse(event.nativeEvent.data) as MapMessage;
    if (message.type === 'ready') props.onReady();
    else if (message.type === 'failed') setFailed(true);
    else props.onMessage?.(message);
  };

  if (failed) {
    return (
      <View style={styles.failed}>
        <Text style={styles.failedText}>{props.failedText}</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={props.web}
      style={styles.web}
      source={{ html: props.html, baseUrl: BASE_URL }}
      originWhitelist={[BASE_URL, 'about:*']}
      // The map's credit links must not take over the screen.
      onShouldStartLoadWithRequest={(request) => request.url.startsWith(BASE_URL) || request.url.startsWith('about:')}
      setSupportMultipleWindows={false}
      onMessage={onMessage}
      onError={() => setFailed(true)}
    />
  );
}

const styles = themedStyles(() => StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.background },
  failed: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6), backgroundColor: colors.tint },
  failedText: { ...type.body, color: colors.muted, textAlign: 'center' },
}));

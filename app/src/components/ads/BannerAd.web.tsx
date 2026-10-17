import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { isOwner } from '@/lib/owner';

/** Adsterra Native Banner: the tag fills the element whose id matches this exact container id. */
const CONTAINER_ID = 'container-049a4bce46e7b67c56ee1b04ca403221';
const SCRIPT_SRC = 'https://dcengg.org/21/049a4bce46e7b67c56ee1b04ca403221';

/**
 * Web-only Adsterra Native Banner slot. Renders the container the tag expects, then loads the ad
 * script so it fills that container.
 */
export function BannerAd({ style }: { style?: StyleProp<ViewStyle> }) {
  const owner = isOwner();
  useEffect(() => {
    if (owner) return;
    // Re-create the script on every mount so returning to Home re-fills the fresh container
    // (the ad script only runs when it loads, and the container is destroyed when we navigate away).
    document.querySelectorAll('[data-zd-native-banner]').forEach((node) => node.remove());
    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.setAttribute('data-zd-native-banner', CONTAINER_ID);
    script.src = SCRIPT_SRC;
    document.body.appendChild(script);
    return () => script.remove();
  }, [owner]);

  if (owner) return null;

  return (
    <View style={style}>
      <div id={CONTAINER_ID} style={{ width: '100%', minHeight: 100 }} />
    </View>
  );
}

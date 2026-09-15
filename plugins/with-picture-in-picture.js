const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/** Lets the main activity shrink into a picture-in-picture window. */
module.exports = function withPictureInPicture(config) {
  return withAndroidManifest(config, (modConfig) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    activity.$['android:supportsPictureInPicture'] = 'true';
    activity.$['android:resizeableActivity'] = 'true';
    return modConfig;
  });
};

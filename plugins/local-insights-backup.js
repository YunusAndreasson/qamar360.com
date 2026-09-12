// Device-only insights must not be transferred by OS backups either. Model weights
// live in cache; this plugin excludes only the persistent local-insights directory.
const { withAndroidManifest, withDangerousMod, withAppDelegate } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function localInsightsBackup(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0].$;
    app['android:fullBackupContent'] = '@xml/local_insights_backup';
    app['android:dataExtractionRules'] = '@xml/local_insights_extraction';
    return cfg;
  });
  config = withDangerousMod(config, ['android', async (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(dir, { recursive: true });
    const exclude = '<exclude domain="file" path="local-insights/" />';
    await fs.writeFile(path.join(dir, 'local_insights_backup.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<full-backup-content>${exclude}</full-backup-content>\n`);
    await fs.writeFile(path.join(dir, 'local_insights_extraction.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<data-extraction-rules><cloud-backup>${exclude}</cloud-backup><device-transfer>${exclude}</device-transfer></data-extraction-rules>\n`);
    return cfg;
  }]);
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('Local insight backup exclusion requires the Swift AppDelegate.');
    const marker = '// Qamar device-only insight storage';
    if (cfg.modResults.contents.includes(marker)) return cfg;
    const anchor = '    let delegate = ReactNativeDelegate()';
    if (!cfg.modResults.contents.includes(anchor)) throw new Error('Could not locate AppDelegate initialization for local insight backup exclusion.');
    cfg.modResults.contents = cfg.modResults.contents.replace(anchor, `    ${marker}
    do {
      var directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("local-insights", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
    } catch {
      // Fail closed: do not launch JS with a backup-eligible private store.
      return false
    }
${anchor}`);
    return cfg;
  });
};

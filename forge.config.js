const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'icon/hsmse-hw-icon'), // no extension for cross-platform
    name: 'HSMSE HW',
    executableName: 'HSMSE HW',
    ignore: (file) => {
      // Normalize path for cross-platform and asar compatibility
      const normalized = file.replace(/\\/g, '/');
      // Always include the secrets/ and data/ directories and their subdirectories
      if (
        normalized === 'secrets' || normalized === '/secrets' ||
        normalized === 'data' || normalized === '/data' ||
        normalized.endsWith('/secrets') || normalized.endsWith('/data') ||
        normalized.startsWith('secrets/') || normalized.startsWith('/secrets/') ||
        normalized.startsWith('data/') || normalized.startsWith('/data/')
      ) {
        // Only ignore files inside, not the directories themselves
        if (normalized.endsWith('.gitkeep')) return false;
        // If it's a file (not a directory)
        const path = require('path');
        if (path.extname(normalized) || /\.[^/]+$/.test(normalized)) return true;
        return false;
      }
      // Other ignore patterns
      return [
        /^old_python_tools\//,
        /assignment_extraction\.log$/,
        /\.log$/,
        /chromedriver$/,
        /geckodriver$/,
        /^webdriver\//,
        /^out\//,
        /^dist-electron\//,
        /^release\//,
        /\.tmp$/,
        /\.temp$/,
        /^HSMSE Assignments\//,
        /npm-debug\.log.*/,
        /yarn-debug\.log.*/,
        /yarn-error\.log.*/
      ].some((re) => re.test(normalized));
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        icon: path.resolve(__dirname, 'icon/hsmse-hw-icon.icns'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'HSMSE_HW',
        iconUrl: '', // Optional: URL to .ico for Windows web installer
        setupIcon: path.resolve(__dirname, 'icon/hsmse-hw-icon.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
};

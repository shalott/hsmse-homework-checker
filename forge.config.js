const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'icon/hsmse-hw-icon'), // no extension for cross-platform
    name: 'HSMSE HW',
    executableName: 'HSMSE HW',
    ignore: [
      /^secrets\//,
      /^data\//,
      /secrets\/jupiter_secret\.json$/,
      /data\/.*\.json$/,
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
    ],
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

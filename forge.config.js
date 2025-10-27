const path = require('path');
const fs = require('fs');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'icon/hsmse-hw-icon'), // no extension for cross-platform
    name: 'HSMSE HW',
    executableName: 'HSMSE HW',
    arch: ['x64', 'arm64'], // Build for both Intel and Apple Silicon Macs
    ignore: [
      /^secrets\//,
      /^data\//,
      /secrets\/jupiter_secret\.json$/,
      /data\/.*\.json$/,
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
        name: 'HSMSE HW-${arch}',
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
  hooks: {
    preMake: async (config, makeOptions) => {
      // Clean the make output directory before building
      const makeDir = path.join(__dirname, 'out', 'make');
      if (fs.existsSync(makeDir)) {
        console.log('Cleaning previous build artifacts...');
        fs.rmSync(makeDir, { recursive: true, force: true });
      }
    }
  }
};

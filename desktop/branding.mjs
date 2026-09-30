// Public identity changes independently of legacy installation/storage identities.
export const PRODUCT_NAME = 'Starship Foundry';
export const PRODUCT_NAME_ZH = '星舰工坊';
export const APP_ID = 'com.aca233.starsectorweb';
export const PROFILE_FOLDER = 'Starsector Web';
export const DEVELOPMENT_PROFILE_FOLDER = 'Starsector Web Development';
export const UNINSTALLER_NAMES = ['Uninstall Starship Foundry.exe', 'Uninstall Starsector Web.exe'];
export function installerExecutableNames(version) {
  return [`Starship-Foundry-Desktop-Setup-${version}-x64.exe`, `Starsector-Web-Desktop-Setup-${version}-x64.exe`];
}

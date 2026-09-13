/**
 * 现代化文本解耦与国际化管理系统 (i18n & Localization)
 * 彻底消除原版将翻译硬编码进 CSV 的痛点。
 * 所有舰船、武器、技能均采用规范命名空间语义键 (如 ship.onslaught.name)，
 * 支持多语言切换、Mod 动态追加字典与占位符变量插值。
 */

export type Locale = 'zh_CN' | 'en_US';

export class LocalizationManager {
  private static instance: LocalizationManager;
  private currentLocale: Locale = 'zh_CN';
  private dictionaries: Record<Locale, Record<string, string>> = {
    zh_CN: {},
    en_US: {}
  };

  private constructor() {}

  public static getInstance(): LocalizationManager {
    if (!LocalizationManager.instance) {
      LocalizationManager.instance = new LocalizationManager();
    }
    return LocalizationManager.instance;
  }

  public setLocale(locale: Locale) {
    this.currentLocale = locale;
  }

  public getLocale(): Locale {
    return this.currentLocale;
  }

  /**
   * 注册/追加文本字典（供核心与各类 Mod 动态挂载）
   */
  public registerStrings(locale: Locale, dict: Record<string, string>) {
    if (!this.dictionaries[locale]) {
      this.dictionaries[locale] = {};
    }
    Object.assign(this.dictionaries[locale], dict);
  }

  /**
   * 翻译指定键，支持参数插值: t('combat.overload_warning', { time: 5.2 })
   */
  public t(key: string, params?: Record<string, string | number>): string {
    let text = this.dictionaries[this.currentLocale]?.[key];
    
    // 降级回退机制：当前语言 -> en_US -> 原始 key
    if (!text && this.currentLocale !== 'en_US') {
      text = this.dictionaries['en_US']?.[key];
    }
    if (!text) {
      text = key;
    }

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return text;
  }
}

export const i18n = LocalizationManager.getInstance();

/**
 * 语言模型 —— 对齐原版 packages/devtools/src/models/locale.model.ts
 *
 * 默认英文；启动后读 os.locale()，以 CN 结尾则切到中文。
 * t() 支持 {{var}} 插值；缺失词条时返回 [KEY] 大写形态（与原版一致）。
 */

import { StateModel } from './state'
import { resources } from '../i18n'

export class LocaleModel extends StateModel {
  constructor(app, defaultLocale = 'en_US') {
    super({})
    this.app = app
    this.defaultLocale = defaultLocale
    this.setLocale(defaultLocale)
  }

  async init() {
    const locale = await Niva.api.os.locale()
    if (locale.endsWith('CN')) {
      this.setLocale('zh_CN')
    }
  }

  setLocale(locale) {
    // 以默认语言打底，再用目标语言覆盖 —— 保证词条有缺漏时不会出现 undefined
    const translation = {
      ...resources[this.defaultLocale],
      ...resources[locale],
    }
    this.setState({
      current: locale,
      translations: translation,
    })
  }

  t(key, option) {
    if (option) {
      const translate = this.state.translations[key]
      if (!translate) {
        return `[${key.toUpperCase()}]`
      }
      let result = translate
      Object.entries(option).forEach(([_key, _value]) => {
        result = result.replaceAll(`{{${_key}}}`, _value)
      })
      return result
    }
    return this.state.translations[key] || `[${key.toUpperCase()}]`
  }
}

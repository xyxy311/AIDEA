/**
 * LocaleId - 界面语言标识（任意字符串）。
 * 语言包 id 由运行时文件 @meta.id 自描述并强校验，编译期不再枚举（新增语言无需改码）。
 * 安全由回退链兜底：theme.locale 指向未登记语言时，t()/naive 映射恒回退 zh-CN。
 */
export type LocaleId = string
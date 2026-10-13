import type { Scope } from '@/types/common'

export interface SessionOptions {
  /**
   * 获取当前会话的Auth Token。
   *
   */
  token?: () => string

  /**
   * 确保获取到可用于当前请求的最新 Token。
   *
   * 当当前 Token 需要刷新或可能已经过期时，
   * 可通过该方法获取更新后的 Token。
   *
   */
  ensureFreshToken?: () => Promise<string>

  /**
   * 获取当前会话的版本标识。
   *
   * 用于识别会话状态的变化，具体用途取决于调用方的实现。
   *
   * @returns 当前会话的作用域或版本标识。
   */
  sessionVersion?: () => Scope

  /**
   * 处理未授权状态。
   *
   * 例如，Token 失效后执行会话清理、重置登录状态
   * 或引导用户重新登录。
   */
  onUnauthorized?: () => void | Promise<void>

  /**
   * 是否要求请求必须携带有效的 Token。
   *
   * 具体的校验时机和失败行为由请求封装层决定。
   */
  requireToken?: boolean
}

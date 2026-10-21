import type { SourceKind } from '../../shared/types'

/**
 * 把底层异常翻译成能直接照着排查的提示。
 * FTP / SMB / WebDAV / 文件系统的失败原因差别很大，统一在驱动这一层做映射，
 * 前端（数据源编辑页的「测试连接」和扫描失败提示）就不用各自猜。
 */
export function describeSourceError(kind: SourceKind | string, err: unknown): string {
  const raw = String((err as Error)?.message ?? err ?? '未知错误')
  const code = (err as NodeJS.ErrnoException)?.code
  const text = raw.toUpperCase()

  if (code === 'ECONNREFUSED' || /ECONNREFUSED/.test(text)) {
    return '无法连接服务器：端口未开放或连接被拒绝（请检查地址、端口以及服务是否已启动）'
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || /TIMEDOUT|TIMEOUT/.test(text)) {
    return '连接服务器超时（请检查局域网连通性、防火墙或服务是否响应）'
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '无法解析主机名（请检查主机地址是否写对）'
  }
  if (code === 'ECONNRESET' || /ECONNRESET/.test(text)) {
    return '连接被服务器重置（端口可能不是对应协议，或服务器主动断开）'
  }

  if (kind === 'local') {
    if (code === 'ENOENT') return '路径不存在：请检查服务器上的目录路径'
    if (code === 'EACCES' || code === 'EPERM') return '没有读取权限：请检查该目录的运行账号权限'
    if (code === 'ENOTDIR') return '目标不是目录：请检查根路径配置'
    return raw
  }

  if (kind === 'webdav') {
    if (/HTTP 401|认证失败|NOT AUTHORIZED/.test(text)) {
      return 'WebDAV 认证失败（401）：用户名或密码不正确'
    }
    if (/HTTP 403/.test(text)) return 'WebDAV 拒绝访问（403）：账号没有权限，或该 IP 被服务器限制'
    if (/HTTP 404/.test(text)) return 'WebDAV 路径不存在（404）：请检查服务器地址与根路径'
    if (/HTTP 405/.test(text)) {
      return '该地址不支持 WebDAV 的 PROPFIND（405）：可能不是 WebDAV 服务，或缺少 dav 模块'
    }
    if (/HTTP 5\d\d/.test(text)) return 'WebDAV 服务端错误：' + raw
    return raw
  }

  if (kind === 'ftp') {
    const numeric = typeof code === 'number' ? code : Number(code)
    if (numeric === 530 || /530|LOGIN INCORRECT|AUTHENTICATION FAILED|NOT LOGGED IN/.test(text)) {
      return 'FTP 登录失败（530）：用户名或密码不正确'
    }
    if (numeric === 550 || /550|NO SUCH FILE|NOT FOUND/.test(text)) {
      return 'FTP 路径不存在或无权限（550）：请检查根路径'
    }
    if (numeric === 425 || numeric === 421 || /425|421/.test(text)) {
      return 'FTP 无法建立数据连接（' + numeric + '）：请检查服务器被动端口与防火墙'
    }
    return raw
  }

  if (kind === 'smb') {
    if (/STATUS_LOGON_FAILURE|STATUS_WRONG_PASSWORD|STATUS_ACCOUNT_DISABLED|STATUS_ACCOUNT_LOCKED_OUT/i.test(text)) {
      return 'SMB 登录失败：用户名或密码不正确（或账号被禁用/锁定）'
    }
    if (/STATUS_BAD_NETWORK_NAME|STATUS_OBJECT_NAME_NOT_FOUND|STATUS_NO_SUCH_FILE|STATUS_NOT_A_DIRECTORY/i.test(text)) {
      return 'SMB 共享或路径不存在：请检查共享名与根路径'
    }
    if (/STATUS_ACCESS_DENIED/i.test(text)) return 'SMB 权限不足：该账号没有这个共享的读取权限'
    if (/STATUS_NETWORK_UNREACHABLE|STATUS_HOST_UNREACHABLE/i.test(text)) {
      return 'SMB 服务器不可达：请检查 445 端口与网络'
    }
    if (/STATUS_BAD_NETWORK_PATH/i.test(text)) return 'SMB 网络路径错误：请确认共享名（不是目录名）'
    return raw
  }

  return raw
}

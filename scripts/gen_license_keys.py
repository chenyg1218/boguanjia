#!/usr/bin/env python3
"""生成 Ed25519 授权密钥对与 API 请求密钥。

用法：
  python scripts/gen_license_keys.py

将 SEED / API_KEY 写入服务器 secrets.env；
将打印的 PUB 更新到 src/boguanjia/license_crypto.py 的 LICENSE_VERIFY_KEY_HEX；
将 API_KEY 同步到 license_crypto.API_REQUEST_KEY_HEX。
"""

from __future__ import annotations

import binascii
import secrets

from nacl.signing import SigningKey


def main() -> None:
    sk = SigningKey.generate()
    seed = binascii.hexlify(sk.encode()).decode()
    pub = binascii.hexlify(sk.verify_key.encode()).decode()
    api = secrets.token_hex(32)
    print("JINDOU_SIGNING_SEED=" + seed)
    print("JINDOU_API_KEY=" + api)
    print("LICENSE_VERIFY_KEY_HEX=" + pub)
    print()
    print("客户端：更新 license_crypto.py 中的 LICENSE_VERIFY_KEY_HEX 与 API_REQUEST_KEY_HEX")
    print("服务端：写入 /opt/jindou-license/secrets.env 后 systemctl restart jindou-license")


if __name__ == "__main__":
    main()

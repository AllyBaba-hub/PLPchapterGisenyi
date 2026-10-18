"""Creates the small test images used by the browser tests in /tmp. Run once: python3 tests/make_fixtures.py"""
import struct, zlib
def png(w, h, c):
    raw = b''.join(b'\x00' + bytes(c) * w for _ in range(h))
    def ch(t, d): x = struct.pack('>I', len(d)) + t + d; return x + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
open('/tmp/pic.png', 'wb').write(png(64, 64, (20, 140, 70)))
open('/tmp/bad.gif', 'wb').write(b'GIF89a')
open('/tmp/big.png', 'wb').write(png(8, 8, (1, 1, 1)) + b'0' * (11 * 1024 * 1024))

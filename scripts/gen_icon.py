#!/usr/bin/env python3
"""生成占位插件图标 icons/icon.png（48x48 / 96x96 深蓝方块 + 白色圆点）"""
import struct, zlib, os

def png(w, h, pixel_fn):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += bytes(pixel_fn(x, y))
    idat = zlib.compress(raw)
    return sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

def make_icon(size):
    cx, cy = size / 2, size / 2
    r = size * 0.22
    def pixel(x, y):
        d = (x - cx) ** 2 + (y - cy) ** 2
        if d < r * r:
            return (255, 255, 255)          # 白色圆点
        return (30, 58, 138)                # 深蓝 #1E3A8A
    return png(size, size, pixel)

out = os.path.join(os.path.dirname(__file__), '..', 'icons', 'icon.png')
out = os.path.normpath(out)
with open(out, 'wb') as f:
    f.write(make_icon(96))
with open(out.replace('.png', '-48.png'), 'wb') as f:
    f.write(make_icon(48))
print("wrote", out, "and 48px variant")

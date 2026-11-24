import zlib
import struct

def create_png(width, height, draw_func):
    # RGBA image buffer
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0) # filter byte 0 (None)
        for x in range(width):
            r, g, b, a = draw_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
            
    compressed = zlib.compress(bytes(raw_data))
    
    png = bytearray(b'\x89PNG\r\n\x1a\n') # Signature
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(struct.pack('>I', 13))
    png.extend(b'IHDR')
    png.extend(ihdr_data)
    png.extend(struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff))
    
    # IDAT
    png.extend(struct.pack('>I', len(compressed)))
    png.extend(b'IDAT')
    png.extend(compressed)
    png.extend(struct.pack('>I', zlib.crc32(b'IDAT' + compressed) & 0xffffffff))
    
    # IEND
    png.extend(struct.pack('>I', 0))
    png.extend(b'IEND')
    png.extend(struct.pack('>I', zlib.crc32(b'IEND') & 0xffffffff))
    
    return bytes(png)

def icon_pixel(x, y, w, h):
    # Rounded rectangle background in LinkedIn Blue (#0A66C2)
    # R=10, G=102, B=194
    radius = max(2, w // 6)
    
    # Check rounded corners
    dx = min(x, w - 1 - x)
    dy = min(y, h - 1 - y)
    
    if dx < radius and dy < radius:
        dist_sq = (radius - dx)**2 + (radius - dy)**2
        if dist_sq > radius**2:
            return (0, 0, 0, 0) # transparent
            
    # Draw simple "L" / extraction symbol
    # Center letter or funnel/extract symbol
    # For simplicity: nice white stylized "in" or "@"
    nx = x / w
    ny = y / h
    
    # White logo area:
    # Let's draw an 'in' style shape
    # 'i' stem and dot
    is_white = False
    
    # dot of i:
    if 0.22 <= nx <= 0.35 and 0.22 <= ny <= 0.35:
        is_white = True
    # stem of i:
    if 0.22 <= nx <= 0.35 and 0.42 <= ny <= 0.78:
        is_white = True
    # n left stem:
    if 0.45 <= nx <= 0.56 and 0.42 <= ny <= 0.78:
        is_white = True
    # n curve:
    if 0.45 <= nx <= 0.78 and 0.42 <= ny <= 0.54:
        is_white = True
    # n right stem:
    if 0.67 <= nx <= 0.78 and 0.45 <= ny <= 0.78:
        is_white = True
        
    if is_white:
        return (255, 255, 255, 255)
    else:
        # Background gradient: LinkedIn blue to slightly deeper blue
        darken = int(ny * 25)
        return (10, max(0, 102 - darken), max(0, 194 - darken), 255)

for size in [16, 32, 48, 128]:
    png_bytes = create_png(size, size, icon_pixel)
    with open(f'icon{size}.png', 'wb') as f:
        f.write(png_bytes)
    print(f'Generated icon{size}.png ({size}x{size})')

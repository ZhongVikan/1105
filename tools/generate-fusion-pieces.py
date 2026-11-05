#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'uiFusionPieces'; OUT.mkdir(exist_ok=True)
S=4
FONT_PATH=ROOT/'assets/fonts/DarkChessKai.ttf'
BLANK=Image.open(ROOT/'uiV2_4/piece_blank_face.png').convert('RGBA')
GENERALS={
 'red':Image.open(ROOT/'uiV2_7/piece_red_general.png').convert('RGBA'),
 'black':Image.open(ROOT/'uiV2_3/piece_black_general.png').convert('RGBA'),
}
COLORS={
 'red':((239,38,27,255),(183,5,3,255),(115,0,0,190)),
 'black':((38,45,47,255),(12,17,19,255),(0,0,0,190)),
}
KINDS=[('rider','骑',False),('gunner','铳',False),('formation','阵',False),('xiao','骁',False),('bombard','轰',False),('guard_king','御',True),('mounted_king','驭',True),('chariot_king','巡',True)]

def mask_text(char,size,center,max_w,max_h):
    font_size=size
    while True:
        font=ImageFont.truetype(str(FONT_PATH),font_size*S)
        box=font.getbbox(char,stroke_width=S)
        if box[2]-box[0]<=max_w*S and box[3]-box[1]<=max_h*S: break
        font_size-=2
    mask=Image.new('L',(256*S,256*S));d=ImageDraw.Draw(mask)
    d.text((center[0]*S,center[1]*S),char,font=font,fill=255,stroke_width=S,stroke_fill=255,anchor='mm')
    return mask

def paint_glyph(image,char,side,size=116,center=(128,126),max_w=150,max_h=125):
    im=image.resize((256*S,256*S),Image.Resampling.LANCZOS)
    mask=mask_text(char,size,center,max_w,max_h)
    hi,lo,shadow=COLORS[side]
    # Soft lower-right relief shadow.
    shifted=Image.new('L',mask.size);shifted.paste(mask,(2*S,2*S))
    shifted=shifted.filter(ImageFilter.GaussianBlur(0.55*S))
    shadow_layer=Image.new('RGBA',im.size,shadow);shadow_layer.putalpha(shifted.point(lambda v:v*shadow[3]//255))
    im=Image.alpha_composite(im,shadow_layer)
    # Vertical face gradient.
    grad=Image.new('RGBA',im.size)
    gd=ImageDraw.Draw(grad)
    top=(center[1]-max_h/2)*S;bottom=(center[1]+max_h/2)*S
    for y in range(im.height):
        t=max(0,min(1,(y-top)/max(1,bottom-top)))
        color=tuple(round(hi[c]+(lo[c]-hi[c])*t) for c in range(4))
        gd.line((0,y,im.width,y),fill=color)
    grad.putalpha(mask)
    im=Image.alpha_composite(im,grad)
    # Fine top-edge highlight for the same carved glossy finish as existing pieces.
    upper=ImageChops.subtract(mask,ImageChops.offset(mask,0,2*S)).filter(ImageFilter.GaussianBlur(.18*S))
    glow=Image.new('RGBA',im.size,(255,130,82,0) if side=='red' else (110,125,130,0));glow.putalpha(upper.point(lambda v:v*72//255))
    im=Image.alpha_composite(im,glow)
    return im.resize((256,256),Image.Resampling.LANCZOS)

def badge(char,side):
    # Small matching wooden piece, fully contained inside the parent piece crop.
    b=BLANK.resize((76,76),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(256,256));canvas.alpha_composite(b,(140,140))
    return paint_glyph(canvas,char,side,size=40,center=(178,177),max_w=43,max_h=40)

def ring_overlay():
    normal=Image.open(ROOT/'uiV2_7/piece_red_cannon.png').convert('RGBA')
    selected=Image.open(ROOT/'uiV2_7/piece_red_cannon_selected.png').convert('RGBA')
    na=normal.getchannel('A');sa=selected.getchannel('A')
    keep=na.point(lambda a:255 if a<28 else 0)
    alpha=ImageChops.multiply(sa,keep)
    out=selected.copy();out.putalpha(alpha);return out
RING=ring_overlay()

for side in ('red','black'):
    for key,char,royal in KINDS:
        if royal:
            image=GENERALS[side].copy(); image=Image.alpha_composite(image,badge(char,side))
        else:
            image=paint_glyph(BLANK.copy(),char,side)
        name=f'piece_{side}_{key}'
        image.save(OUT/f'{name}.png')
        selected=Image.alpha_composite(image,RING)
        selected.save(OUT/f'{name}_selected.png')

(OUT/'game.js').write_text("// Fusion piece UI subpackage.\n")
print(f'generated {len(KINDS)*2*2} PNG files in {OUT}')

"""Make a rendered diagram look like a phone photo of a whiteboard/paper sketch, and warp annotations to match."""
import io, numpy as np
from PIL import Image, ImageFilter


def homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y, -u], [0, 0, 0, x, y, 1, -v * x, -v * y, -v]]
    h = np.linalg.svd(np.array(A, float))[2][-1]
    return (h / h[-1]).reshape(3, 3)


def apply_h(Hm, pts):
    p = np.atleast_2d(np.asarray(pts, float))
    q = np.column_stack([p, np.ones(len(p))]) @ Hm.T
    return q[:, :2] / q[:, 2:3]


def warp_ann(ann, Hm, W, H):
    def box(b):
        x0, y0, x1, y1 = b
        q = apply_h(Hm, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
        return [round(float(np.clip(q[:, 0].min(), 0, W)), 1), round(float(np.clip(q[:, 1].min(), 0, H)), 1),
                round(float(np.clip(q[:, 0].max(), 0, W)), 1), round(float(np.clip(q[:, 1].max(), 0, H)), 1)]
    for a in ann:
        for k in ("polyline", "polygon"):
            if a.get(k): a[k] = np.round(apply_h(Hm, a[k]), 1).tolist()
        for k in ("center", "from", "to"):
            if a.get(k): a[k] = np.round(apply_h(Hm, [a[k]])[0], 1).tolist()
        for k in ("bbox", "label_bbox"):
            if a.get(k): a[k] = box(a[k])
    return ann


def photo(path, ann, style, rng):
    p_photo = 0.65 if style.get("hand") else 0.12
    if rng.random() > p_photo: return ann, None
    im = Image.open(path).convert("RGB"); W, H = im.size
    j = rng.uniform(0.0, 0.07)
    src = np.array([(0, 0), (W, 0), (W, H), (0, H)], float)
    dst = src + rng.uniform(-j, j, (4, 2)) * (W, H) + rng.uniform(0, j, (4, 2)) * np.array([(1, 1), (-1, 1), (-1, -1), (1, -1)]) * (W, H)
    rot = np.deg2rad(rng.uniform(-6, 6)); c, s = np.cos(rot), np.sin(rot); ctr = np.array([W / 2, H / 2])
    dst = (dst - ctr) @ np.array([[c, -s], [s, c]]).T + ctr
    Hm = homography(src, dst); Hi = np.linalg.inv(Hm); Hi /= Hi[2, 2]
    surround = tuple(int(v) for v in rng.integers(70, 190, 3))
    out = im.transform((W, H), Image.PERSPECTIVE, tuple(Hi.flatten()[:8]), Image.BILINEAR, fillcolor=surround)
    a = np.asarray(out, np.float32)
    yy, xx = np.mgrid[0:H, 0:W] / max(W, H)
    th = rng.uniform(0, 2 * np.pi)
    light = 1 + rng.uniform(0.05, 0.25) * ((np.cos(th) * xx + np.sin(th) * yy) - 0.5) * -1 - rng.uniform(0, 0.12)
    a *= light[..., None] * rng.uniform(0.94, 1.06, 3)
    if rng.random() < 0.4:
        gx, gy, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(80, 260)
        a += rng.uniform(20, 70) * np.exp(-(((np.mgrid[0:H, 0:W][1] - gx) ** 2 + (np.mgrid[0:H, 0:W][0] - gy) ** 2) / (2 * r * r)))[..., None]
    a += rng.normal(0, rng.uniform(0, 7), a.shape)
    out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    blur = float(rng.uniform(0, 1.3))
    if blur > 0.3: out = out.filter(ImageFilter.GaussianBlur(blur))
    q = int(rng.integers(35, 90)); buf = io.BytesIO(); out.save(buf, "JPEG", quality=q)
    Image.open(buf).save(path)
    return warp_ann(ann, Hm, W, H), {"jitter": round(j, 3), "rot_deg": round(float(np.rad2deg(rot)), 2), "blur": round(blur, 2), "jpeg_q": q}

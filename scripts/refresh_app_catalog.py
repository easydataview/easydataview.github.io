#!/usr/bin/env python3
"""Refresh the site's Apple Store catalog and high-confidence YouTube video matches.

Only public official sources are used. Failures preserve the existing site data.
Run: python3 scripts/refresh_app_catalog.py
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "docs" / "apps.json"
INDEX = ROOT / "docs" / "index.html"
PAGES = ROOT / "docs" / "apps"
APPLE_DEVELOPER_ID = 1639123510
YOUTUBE_CHANNEL = "UC-liqhYGH2SZSWBs3GgeVGA"
HTTP_HEADERS = {"User-Agent": "EasyDataView-Website-Catalog/1.0"}
ALIASES = {
    "app-31": ["saying", "speech note", "語音筆記"],
    "app-45": ["入油紀錄", "fuel log"],
    "app-46": ["快識字", "ocr text"],
    "app-47": ["好好愛你"],
    "app-48": ["timemates", "time mates", "時差拍檔"],
    "app-49": ["簡單換算", "簡單轉換"],
    "app-50": ["小英伴", "little english"],
}


def get_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(request, timeout=24) as response:
        return response.read()


def get_json(url: str) -> dict:
    return json.loads(get_bytes(url).decode("utf-8"))


def valid_track(track: dict) -> bool:
    if track.get("wrapperType") != "software":
        return False
    artist_id = track.get("artistId")
    return artist_id == APPLE_DEVELOPER_ID or (
        artist_id is None and str(track.get("artistName", "")).strip() == "Huaping Ye"
    )


def app_store_id(app: dict) -> str | None:
    match = re.search(r"/id(\d+)", app.get("links", {}).get("apple", ""))
    return match.group(1) if match else None


def official_tracks(apps: list[dict]) -> dict[str, dict]:
    ids = sorted({app_store_id(app) for app in apps if app_store_id(app)})
    tracks: dict[str, dict] = {}
    for start in range(0, len(ids), 20):
        batch = ids[start:start + 20]
        url = "https://itunes.apple.com/lookup?" + urllib.parse.urlencode({
            "country": "hk", "entity": "software", "id": ",".join(batch)
        })
        try:
            result = get_json(url)
        except Exception as exc:
            print(f"Apple lookup failed for batch {start}: {exc}", file=sys.stderr)
            continue
        for item in result.get("results", []):
            if valid_track(item):
                tracks[str(item["trackId"])] = item
    return tracks


def developer_tracks() -> list[dict]:
    url = "https://itunes.apple.com/lookup?" + urllib.parse.urlencode({
        "id": APPLE_DEVELOPER_ID, "entity": "software", "country": "hk", "limit": 200
    })
    try:
        result = get_json(url)
        return [row for row in result.get("results", []) if valid_track(row)]
    except Exception as exc:
        print(f"Developer lookup unavailable: {exc}", file=sys.stderr)
        return []


def category_for(track: dict) -> str:
    genre = str(track.get("primaryGenreName", "")).lower()
    if "game" in genre or "entertainment" in genre:
        return "趣味遊戲"
    if "education" in genre:
        return "語言與兒童學習"
    if "book" in genre or "reference" in genre:
        return "閱讀與文學"
    if "photo" in genre or "productivity" in genre:
        return "文字與影像工具"
    if "health" in genre or "lifestyle" in genre or "food" in genre:
        return "生活與健康"
    return "實用工具"


def add_new_apps(apps: list[dict], tracks: list[dict]) -> list[dict]:
    seen = {app_store_id(a) for a in apps}
    next_number = max(int(a["id"].split("-")[-1]) for a in apps) + 1
    additions = []
    for track in sorted(tracks, key=lambda x: (x.get("releaseDate", ""), x.get("trackId", 0))):
        store_id = str(track["trackId"])
        if store_id in seen:
            continue
        name = track.get("trackName") or f"App {store_id}"
        description = " ".join(str(track.get("description", "")).split())[:170]
        app = {
            "id": f"app-{next_number}",
            "name": name,
            "description": description,
            "category": category_for(track),
            "links": {"apple": track.get("trackViewUrl") or f"https://apps.apple.com/hk/app/id{store_id}"},
            "screenshots": [],
        }
        apps.append(app)
        additions.append(app)
        seen.add(store_id)
        next_number += 1
    return additions


def apply_apple(apps: list[dict], tracks: dict[str, dict]) -> int:
    count = 0
    today = dt.date.today()
    for app in apps:
        store_id = app_store_id(app)
        track = tracks.get(store_id or "")
        if track is None:
            continue
        count += 1
        for source, dest in [
            ("version", "version"), ("releaseNotes", "releaseNotes"),
            ("primaryGenreName", "storeCategory"),
            ("trackName", "storeName"), ("artworkUrl512", "appleArtwork"),
        ]:
            if track.get(source):
                app[dest] = track[source]
        date = (track.get("currentVersionReleaseDate") or "")[:10]
        try:
            when = dt.date.fromisoformat(date)
            if when <= today + dt.timedelta(days=1):
                app["updated"] = date
        except ValueError:
            pass
        screens = track.get("screenshotUrls") or track.get("ipadScreenshotUrls") or []
        if screens:
            app["appleScreenshots"] = [s for s in screens[:8] if s.startswith("https://")]
        # Keep curated app names, summaries, YouTube links, and purpose-based categories.
    return count


def youtube_items() -> list[dict]:
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={YOUTUBE_CHANNEL}"
    try:
        root = ET.fromstring(get_bytes(url))
    except Exception as exc:
        print(f"YouTube feed unavailable, keeping existing videos: {exc}", file=sys.stderr)
        return []
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
    found = []
    for entry in root.findall("a:entry", ns):
        title = entry.findtext("a:title", default="", namespaces=ns).strip()
        video_id = entry.findtext("yt:videoId", default="", namespaces=ns).strip()
        published = entry.findtext("a:published", default="", namespaces=ns).strip()
        if title and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            found.append({"title": title, "video_id": video_id, "published": published})
    return sorted(found, key=lambda x: x["published"], reverse=True)


def match_video(title: str, apps: list[dict]) -> dict | None:
    normalized = re.sub(r"[\s・_-]+", "", title).casefold()
    candidates = []
    for app in apps:
        names = ALIASES.get(app["id"], []) + [app["name"]]
        for alias in names:
            alias_norm = re.sub(r"[\s・_-]+", "", alias).casefold()
            if len(alias_norm) < 3:
                continue
            if alias_norm in normalized:
                candidates.append((len(alias_norm), app))
    if not candidates:
        return None
    best = max(size for size, _ in candidates)
    winners = {app["id"]: app for size, app in candidates if size == best}
    return next(iter(winners.values())) if len(winners) == 1 else None


def apply_videos(apps: list[dict], videos: list[dict]) -> int:
    applied = 0
    assigned = set()
    for video in videos:
        app = match_video(video["title"], apps)
        if app is None or app["id"] in assigned:
            continue
        assigned.add(app["id"])
        existing = app.get("video") or {}
        if existing.get("published") and video["published"] < existing["published"]:
            continue
        old_url = existing.get("url", "")
        new_url = f"https://www.youtube.com/watch?v={video['video_id']}"
        app["video"] = {
            "title": video["title"],
            "url": new_url,
            "published": video["published"],
        }
        if old_url and old_url != new_url:
            old_match = re.search(r"(?:v=|shorts/|embed/)([A-Za-z0-9_-]{11})", old_url)
            path = PAGES / f"{app['id']}.html"
            if old_match and path.exists():
                page = path.read_text(encoding="utf-8")
                page = page.replace(old_match.group(1), video["video_id"])
                path.write_text(page, encoding="utf-8")
        applied += 1
    return applied


def build_page(app: dict) -> None:
    path = PAGES / f"{app['id']}.html"
    title, description = html.escape(app["name"]), html.escape(app.get("description", ""))
    link = html.escape(app["links"]["apple"], quote=True)
    artwork = html.escape(app.get("appleArtwork", ""), quote=True)
    art = f'<img src="{artwork}" width="100" height="100" alt="{title} 官方 App Store 圖示">' if artwork else ""
    path.write_text(f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="{description}"><title>{title} — 林林寫 App App</title><link rel="stylesheet" href="../comic.css"><style>main{{max-width:920px;margin:auto;padding:35px 22px}}.panel{{border:2px solid #163e32;border-radius:18px;padding:clamp(20px,5vw,50px);background:#fffdf6;box-shadow:5px 5px 0 #163e32}}.store{{display:inline-block;padding:13px 18px;border-radius:9px;background:#163e32;color:#fff}}p{{line-height:1.8}}.screens{{display:flex;gap:12px;overflow-x:auto}}.screens img{{max-height:340px}}</style></head><body><main><p><a href="../index.html#works">← 返回作品一覽</a></p><article class="panel"><div class="detail-hero">{art}<h1>{title}</h1></div><p>{description}</p><div id="watch"><a class="store" href="{link}" target="_blank" rel="noopener noreferrer">App Store 下載 ↗</a></div><section><h2>App Store 官方截圖</h2><div class="screens"></div></section><p><a href="https://www.youtube.com/channel/{YOUTUBE_CHANNEL}/videos" target="_blank" rel="noopener noreferrer">查看 EasyDataView 最新影片 ↗</a></p></article></main><script src="../portfolio.js" defer></script></body></html>''', encoding="utf-8")


def update_index_for_new_apps(additions: list[dict], count: int) -> None:
    if not additions or not INDEX.exists():
        return
    page = INDEX.read_text(encoding="utf-8")
    anchor = '<article class="real-card"'
    fragments = []
    for app in additions:
        title = html.escape(app["name"], quote=True)
        description = html.escape(app.get("description", ""))
        image = html.escape(app.get("appleArtwork", ""), quote=True)
        image_html = f'<img src="{image}" alt="{title} Apple App Store 圖示" width="58" height="58" loading="lazy">' if image else '<span class="new-app-icon">📱</span>'
        fragments.append(f'<article class="real-card" data-platform="apple" data-category="{html.escape(app["category"], quote=True)}" data-name="{title}"><div class="compact-top">{image_html}<div><h3><a href="apps/{app["id"]}.html#watch">{title}</a></h3><span class="platform-label">iPhone / iPad</span></div></div><p>{description}</p><a class="simple-action" href="apps/{app["id"]}.html#watch">了解更多・下載 ↗</a></article>')
    if anchor in page:
        page = page.replace(anchor, "".join(fragments) + anchor, 1)
    page = re.sub(r'(<span id="app-count"[^>]*>)[^<]*(</span>)', rf'\g<1>{count} 個作品\g<2>', page)
    page = re.sub(r'共\s*\d+\s*個作品', f'共 {count} 個作品', page)
    INDEX.write_text(page, encoding="utf-8")


def main() -> None:
    apps = json.loads(CATALOG.read_text(encoding="utf-8"))
    tracks = official_tracks(apps)
    discovery = developer_tracks()
    additions = add_new_apps(apps, discovery)
    for track in discovery:
        if valid_track(track):
            tracks[str(track["trackId"])] = track
    apple_count = apply_apple(apps, tracks)
    video_count = apply_videos(apps, youtube_items())
    for app in additions:
        build_page(app)
    update_index_for_new_apps(additions, len(apps))
    updated = json.dumps(apps, ensure_ascii=False, indent=2) + "\n"
    if updated != CATALOG.read_text(encoding="utf-8"):
        CATALOG.write_text(updated, encoding="utf-8")
    print(f"Catalog: {len(apps)} works, {apple_count} Apple records verified, {len(additions)} new apps, {video_count} channel videos matched.")


if __name__ == "__main__":
    main()

"""유튜브 채널의 영상과 재생목록을 data/videos.json 으로 저장합니다.

- YT_API_KEY 가 있으면 YouTube Data API 를 씁니다(가장 정확).
- 없으면 yt-dlp 로 가져옵니다. 날짜가 없는 영상은 조금씩 채워 나갑니다.
- 둘 다 실패하면 RSS(최신 15개)라도 가져옵니다.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "videos.json"
SITE = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))
YT = SITE.get("youtube", {})
CHANNEL_ID = YT.get("channelId", "")
HANDLE = YT.get("handle", "").lstrip("@")
CHANNEL_URL = f"https://www.youtube.com/@{HANDLE}" if HANDLE else f"https://www.youtube.com/channel/{CHANNEL_ID}"
DESC_LIMIT = 300
DATE_FILL_PER_RUN = 40


def load_old():
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {"playlists": [], "videos": []}


def clip(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s[:DESC_LIMIT]


def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------- 1) YouTube Data API ----------
def via_api(key):
    base = "https://www.googleapis.com/youtube/v3/"

    def call(path, **params):
        params["key"] = key
        return get_json(base + path + "?" + urllib.parse.urlencode(params))

    ch = call("channels", part="contentDetails", id=CHANNEL_ID)
    uploads = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]

    def items(pl):
        out, token = [], None
        while True:
            p = {"part": "snippet,contentDetails", "playlistId": pl, "maxResults": 50}
            if token:
                p["pageToken"] = token
            r = call("playlistItems", **p)
            out += r.get("items", [])
            token = r.get("nextPageToken")
            if not token:
                return out

    videos = {}
    for it in items(uploads):
        sn, cd = it["snippet"], it["contentDetails"]
        vid = cd["videoId"]
        if sn.get("title") in ("Private video", "Deleted video"):
            continue
        videos[vid] = {
            "id": vid,
            "title": sn.get("title", ""),
            "published": cd.get("videoPublishedAt") or sn.get("publishedAt", ""),
            "description": clip(sn.get("description")),
            "playlists": [],
        }
    playlists, token = [], None
    while True:
        p = {"part": "snippet", "channelId": CHANNEL_ID, "maxResults": 50}
        if token:
            p["pageToken"] = token
        r = call("playlists", **p)
        for pl in r.get("items", []):
            playlists.append({"id": pl["id"], "title": pl["snippet"]["title"]})
        token = r.get("nextPageToken")
        if not token:
            break
    for pl in playlists:
        for it in items(pl["id"]):
            vid = it["contentDetails"]["videoId"]
            if vid in videos:
                videos[vid]["playlists"].append(pl["id"])
    return playlists, list(videos.values())


# ---------- 2) yt-dlp ----------
def via_ytdlp(old):
    import yt_dlp

    flat = {"extract_flat": "in_playlist", "quiet": True, "skip_download": True, "ignoreerrors": True}
    with yt_dlp.YoutubeDL(flat) as y:
        info = y.extract_info(CHANNEL_URL + "/videos", download=False) or {}
        entries = [e for e in (info.get("entries") or []) if e and e.get("id")]
        try:
            pinfo = y.extract_info(CHANNEL_URL + "/playlists", download=False) or {}
            pls = [e for e in (pinfo.get("entries") or []) if e and e.get("id")]
        except Exception:
            pls = []
        playlists, members = [], {}
        for p in pls:
            playlists.append({"id": p["id"], "title": p.get("title") or ""})
            try:
                pi = y.extract_info("https://www.youtube.com/playlist?list=" + p["id"], download=False) or {}
                members[p["id"]] = {e["id"] for e in (pi.get("entries") or []) if e and e.get("id")}
            except Exception:
                members[p["id"]] = set()

    prev = {v["id"]: v for v in old.get("videos", [])}
    videos = []
    for e in entries:
        vid = e["id"]
        o = prev.get(vid, {})
        ts = e.get("timestamp") or e.get("release_timestamp")
        pub = o.get("published") or (dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ") if ts else "")
        if not pub and e.get("upload_date"):
            d = e["upload_date"]
            pub = f"{d[:4]}-{d[4:6]}-{d[6:]}T00:00:00Z"
        videos.append({
            "id": vid,
            "title": e.get("title") or o.get("title", ""),
            "published": pub,
            "description": clip(e.get("description")) or o.get("description", ""),
            "playlists": [pid for pid, m in members.items() if vid in m],
        })

    # 날짜가 없는 영상은 한 편씩 열어 채웁니다(한 번에 일부만)
    missing = [v for v in videos if not v["published"]][:DATE_FILL_PER_RUN]
    if missing:
        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True, "ignoreerrors": True}) as y:
            for v in missing:
                try:
                    d = y.extract_info("https://www.youtube.com/watch?v=" + v["id"], download=False) or {}
                    ud = d.get("upload_date")
                    if ud:
                        v["published"] = f"{ud[:4]}-{ud[4:6]}-{ud[6:]}T00:00:00Z"
                    if not v["description"]:
                        v["description"] = clip(d.get("description"))
                except Exception:
                    pass
    return playlists, videos


# ---------- 3) RSS (최신 15개) ----------
def via_rss(old):
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}
    with urllib.request.urlopen("https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID, timeout=30) as r:
        root = ET.fromstring(r.read())
    prev = {v["id"]: v for v in old.get("videos", [])}
    for e in root.findall("a:entry", ns):
        vid = e.findtext("yt:videoId", namespaces=ns)
        desc = e.find("m:group/m:description", ns)
        prev[vid] = {
            "id": vid,
            "title": e.findtext("a:title", namespaces=ns) or "",
            "published": e.findtext("a:published", namespaces=ns) or "",
            "description": clip(desc.text if desc is not None else ""),
            "playlists": prev.get(vid, {}).get("playlists", []),
        }
    return old.get("playlists", []), list(prev.values())


def main():
    old = load_old()
    key = os.environ.get("YT_API_KEY", "").strip()
    result, how = None, ""
    if key:
        try:
            result, how = via_api(key), "api"
        except Exception as e:
            print("API failed:", e, file=sys.stderr)
    if not result:
        try:
            result, how = via_ytdlp(old), "yt-dlp"
            if not result[1]:
                result = None
        except Exception as e:
            print("yt-dlp failed:", e, file=sys.stderr)
    if not result:
        try:
            result, how = via_rss(old), "rss"
        except Exception as e:
            print("RSS failed:", e, file=sys.stderr)
            sys.exit(0)  # 실패해도 기존 목록을 그대로 둡니다
    playlists, videos = result
    videos.sort(key=lambda v: v.get("published") or "", reverse=True)
    used = {p for v in videos for p in v.get("playlists", [])}
    playlists = [p for p in playlists if p["id"] in used]
    new = {"playlists": playlists, "videos": videos}
    if {k: old.get(k) for k in new} == new:
        print("no change")
        return
    new = {"updated": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z", "source": how, **new}
    OUT.write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"saved {len(videos)} videos, {len(playlists)} playlists via {how}")


if __name__ == "__main__":
    main()

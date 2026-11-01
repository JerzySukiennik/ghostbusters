# Janine's radio lines: Gemini TTS per line, then a two-way radio chain (band-pass, soft clip, static, squelch) to mp3 + ogg.
import base64, json, os, re, subprocess, sys, time, urllib.request, urllib.error, wave

MODEL = os.environ.get("TTS_MODEL", "gemini-3.8-flash-tts")
KEYS = [k for k in os.environ.get("GEMINI_API_KEYS", os.environ.get("GEMINI_API_KEY", "")).split(",") if k]
STYLE = ("Janine, the receptionist of a small ghost-catching business in New York in 1984, talking into a two-way radio "
         "to the crew in their car. Bored, deadpan, slightly nasal New York accent, quick and matter-of-fact, a little sarcastic, never theatrical.")


def tts(text, voice, style=STYLE, rounds=2):
    prompt = f"### DIRECTOR'S NOTES\n{style}\n### TRANSCRIPT\n{text}"
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}}}}
    last = None
    for i in range(rounds * len(KEYS)):
        if i and i % len(KEYS) == 0:
            time.sleep(5)
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                                     data=json.dumps(body).encode(), headers={"x-goog-api-key": KEYS[i % len(KEYS)], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.load(r)
            part = d["candidates"][0]["content"]["parts"][0]["inlineData"]
            return base64.b64decode(part["data"])
        except urllib.error.HTTPError as e:
            last = f"{e.code} {e.read()[:200]!r}"
            if e.code not in (400, 401, 403, 429, 500, 503):
                break
        except Exception as e:
            last = repr(e)
    raise RuntimeError(last)


def call(model, body):
    last = None
    for k in KEYS * 2:
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                     data=json.dumps(body).encode(), headers={"x-goog-api-key": k, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            last = repr(e)
    raise RuntimeError(last)


def words(t):
    t = t.lower().replace("ecto-1", "ecto one").replace("ecto 1", "ecto one")
    return re.findall(r"[a-z]+|\d+", t)


def heard_ok(raw, text, rate=24000):
    buf = bytearray(b"RIFF") + (36 + len(raw)).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + (1).to_bytes(2, "little")
    buf += rate.to_bytes(4, "little") + (rate * 2).to_bytes(4, "little") + (2).to_bytes(2, "little") + (16).to_bytes(2, "little") + b"data" + len(raw).to_bytes(4, "little") + raw
    d = call("gemini-3.5-flash", {"contents": [{"parts": [{"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(bytes(buf)).decode()}}, {"text": "Transcribe this audio verbatim, words only, numbers as digits."}]}]})
    got = d["candidates"][0]["content"]["parts"][0]["text"]
    want = set(words(text)) | {str(n) for n in range(10000)}
    hw = [w for w in words(got) if not w.isdigit()]
    extra = sum(1 for w in hw if w not in want) / max(1, len(hw))
    return extra <= 0.12, got


def radio(raw, out_base, rate=24000):
    wav = out_base + ".raw.wav"
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(raw)
    speech = len(raw) / 2 / rate
    dur = speech + 0.18 + 0.28
    fc = (f"[0:a]adelay=180|180,apad=pad_dur=0.28,highpass=f=380,lowpass=f=3100,"
          f"acompressor=threshold=-22dB:ratio=4:attack=4:release=80,asoftclip=type=tanh:param=1.4,volume=1.5[v];"
          f"[1:a]highpass=f=600,lowpass=f=4200,volume='if(lt(t,0.15),7,if(gt(t,{dur - 0.22:.3f}),6,1))':eval=frame[n];"
          f"[v][n]amix=inputs=2:duration=first:weights=1 0.3:normalize=0,atrim=0:{dur:.3f},afade=t=out:st={dur - 0.04:.3f}:d=0.04[m]")
    base = ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-f", "lavfi", "-i", f"anoisesrc=d={dur + 0.5:.3f}:c=pink:r={rate}:a=0.018", "-filter_complex", fc, "-map", "[m]", "-ac", "1"]
    subprocess.run(base + ["-c:a", "libmp3lame", "-q:a", "4", out_base + ".mp3"], check=True)
    subprocess.run(base + ["-ar", "48000", "-c:a", "libopus", "-b:a", "48k", out_base + ".ogg"], check=True)
    os.remove(wav)
    return dur


def main(spec_path, out_dir):
    spec = json.load(open(spec_path))
    os.makedirs(out_dir, exist_ok=True)
    man_path = os.path.join(out_dir, "lines.json")
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    report = {}
    for line in spec["lines"]:
        base = os.path.join(out_dir, line["id"])
        if os.path.exists(base + ".mp3") and not line.get("force") and man.get(line["id"], {}).get("text") == line["text"]:
            continue
        n = len(line["text"].split())
        good = None
        for attempt in range(6):
            raw = tts(line["text"], line.get("voice", spec.get("voice", "Kore")), line.get("style", spec.get("style", STYLE)))
            if len(raw) / 48000 > 1.5 + n / 1.6:
                print(line["id"], "too long, retry", round(len(raw) / 48000, 1), flush=True)
                continue
            ok, got = heard_ok(raw, line["text"])
            if ok:
                good = raw
                break
            print(line["id"], "mismatch, retry:", got[:120].replace("\n", " "), flush=True)
        if good is None:
            print(line["id"], "FAILED", flush=True)
            continue
        raw = good
        report[line["id"]] = round(radio(raw, base), 2)
        man[line["id"]] = {"text": line["text"], "dur": report[line["id"]], "files": [line["id"] + ".ogg", line["id"] + ".mp3"]}
        json.dump(man, open(man_path, "w"), indent=1)
        print(line["id"], report[line["id"]], flush=True)
    return report


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

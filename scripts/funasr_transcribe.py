import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave
from contextlib import redirect_stdout


def emit(payload, code=0):
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)


def cached_model_path(model_name):
    """Use a downloaded ModelScope model without making a network request."""
    if not model_name or os.path.isabs(model_name):
        return model_name

    cache_root = os.path.expanduser(
        os.environ.get("FUNASR_MODEL_CACHE_DIR", "~/.cache/modelscope/hub/models")
    )
    candidate = os.path.join(cache_root, model_name)
    return candidate if os.path.isdir(candidate) else model_name


def progress(percent, stage):
    payload = {
        "type": "progress",
        "percent": percent,
        "stage": stage,
    }
    text = "__FUNASR_PROGRESS__" + json.dumps(payload, ensure_ascii=False)
    print(text, file=sys.stderr, flush=True)
    progress_path = os.environ.get("FUNASR_PROGRESS_PATH")
    if progress_path:
        try:
            with open(progress_path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, ensure_ascii=False) + "\n")
        except OSError:
            pass


def normalize_sentence_info(result):
    segments = []
    sentence_info = result.get("sentence_info") or []
    for index, item in enumerate(sentence_info):
        speaker = item.get("spk", item.get("speaker", 0))
        start_ms = item.get("start", 0)
        end_ms = item.get("end", start_ms)
        text = item.get("text") or item.get("sentence") or ""
        segments.append({
            "speaker_label": f"SPEAKER_{int(speaker):02d}" if str(speaker).isdigit() else str(speaker),
            "start_time": round(float(start_ms) / 1000, 3),
            "end_time": round(float(end_ms) / 1000, 3),
            "text": str(text).strip(),
        })
    return [segment for segment in segments if segment["text"]]


def normalize_plain_text(result):
    text = str(result.get("text") or "").strip()
    if not text:
        return []
    return [{
        "speaker_label": "SPEAKER_00",
        "start_time": 0,
        "end_time": 0,
        "text": text,
    }]


def read_hotwords():
    raw = os.environ.get("FUNASR_HOTWORDS", "")
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(word).strip() for word in parsed if str(word).strip()]
    except json.JSONDecodeError:
        pass
    return [word.strip() for word in raw.replace("，", ",").replace(";", ",").split(",") if word.strip()]


def hotword_text(words):
    cleaned = []
    seen = set()
    for word in words:
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(word)
    return " ".join(cleaned[:200])


def prepare_audio_for_demo(audio_path):
    cleanup_paths = []
    note_parts = []
    working_path = audio_path

    if not working_path.lower().endswith(".wav"):
        converted_path, convert_note = convert_to_wav(working_path)
        if converted_path:
            working_path = converted_path
            cleanup_paths.append(converted_path)
            note_parts.append(convert_note)
        else:
            return audio_path, None, cleanup_paths

    prepared_path, prepare_note = prepare_wav_for_demo(working_path)
    if prepared_path != working_path:
        cleanup_paths.append(prepared_path)
        working_path = prepared_path
    if prepare_note:
        note_parts.append(prepare_note)

    return working_path, " | ".join(note_parts) if note_parts else None, cleanup_paths


def convert_to_wav(audio_path):
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return convert_to_wav_with_ffmpeg(audio_path, ffmpeg)

    afconvert = shutil.which("afconvert")
    if afconvert:
        return convert_to_wav_with_afconvert(audio_path, afconvert)

    return None, None


def convert_to_wav_with_ffmpeg(audio_path, converter):
    output = tempfile.NamedTemporaryFile(prefix="funasr_converted_", suffix=".wav", delete=False)
    output_path = output.name
    output.close()

    command = [
        converter,
        "-y",
        "-i", audio_path,
        "-ac", "1",
        "-ar", "16000",
        "-sample_fmt", "s16",
        output_path,
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        try:
            os.unlink(output_path)
        except OSError:
            pass
        message = (completed.stderr or completed.stdout or "ffmpeg 转换失败").strip()
        raise RuntimeError("音频格式转换失败：" + message)

    return output_path, "Converted audio to 16k mono wav with ffmpeg"


def convert_to_wav_with_afconvert(audio_path, converter):
    output = tempfile.NamedTemporaryFile(prefix="funasr_converted_", suffix=".wav", delete=False)
    output_path = output.name
    output.close()

    command = [
        converter,
        "-f", "WAVE",
        "-d", "LEI16@16000",
        "-c", "1",
        audio_path,
        output_path,
    ]
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        try:
            os.unlink(output_path)
        except OSError:
            pass
        message = (completed.stderr or completed.stdout or "afconvert 转换失败").strip()
        raise RuntimeError("音频格式转换失败：" + message)

    return output_path, "Converted audio to 16k mono wav with afconvert"


def prepare_wav_for_demo(audio_path):
    if not audio_path.lower().endswith(".wav"):
        return audio_path, None

    max_seconds = float(os.environ.get("FUNASR_MAX_SECONDS", "180"))
    try:
        source = wave.open(audio_path, "rb")
    except wave.Error:
        return audio_path, None

    with source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        frame_rate = source.getframerate()
        total_frames = source.getnframes()
        duration = total_frames / frame_rate if frame_rate else 0
        needs_trim = max_seconds > 0 and duration > max_seconds
        needs_mono = channels > 1
        if not needs_trim and not needs_mono:
            return audio_path, None

        output = tempfile.NamedTemporaryFile(prefix="funasr_prepared_", suffix=".wav", delete=False)
        output_path = output.name
        output.close()

        frames_to_copy = total_frames
        if needs_trim:
            frames_to_copy = min(total_frames, int(frame_rate * max_seconds))

        with wave.open(output_path, "wb") as target:
            target.setnchannels(1 if needs_mono else channels)
            target.setsampwidth(sample_width)
            target.setframerate(frame_rate)

            chunk_frames = max(1, frame_rate * 10)
            copied = 0
            while copied < frames_to_copy:
                count = min(chunk_frames, frames_to_copy - copied)
                raw = source.readframes(count)
                if not raw:
                    break
                if needs_mono:
                    raw = first_channel(raw, channels, sample_width)
                target.writeframes(raw)
                copied += count

        message = (
            f"Prepared wav for demo: channels {channels}->"
            f"{1 if needs_mono else channels}, duration {duration:.1f}s->"
            f"{min(duration, max_seconds) if needs_trim else duration:.1f}s"
        )
        return output_path, message


def first_channel(raw, channels, sample_width):
    frame_width = channels * sample_width
    if frame_width <= 0:
        return raw
    output = bytearray()
    for index in range(0, len(raw), frame_width):
        frame = raw[index:index + frame_width]
        if len(frame) >= sample_width:
            output.extend(frame[:sample_width])
    return bytes(output)


def main():
    if len(sys.argv) < 2:
        emit({"error": "缺少音频文件路径"}, 2)

    original_audio_path = sys.argv[1]
    if not os.path.exists(original_audio_path):
        emit({"error": f"音频文件不存在：{original_audio_path}"}, 2)

    audio_path = original_audio_path
    cleanup_paths = []
    preparation_note = None

    try:
        with redirect_stdout(sys.stderr):
            from funasr import AutoModel
            from funasr.utils.postprocess_utils import rich_transcription_postprocess
    except Exception as exc:
        emit({
            "error": (
                "当前 Python 环境没有安装 FunASR。请先安装 torch、torchaudio、funasr，"
                "或在 Colab 验证后再运行本地转录。原始错误：" + str(exc)
            )
        }, 3)

    model_name = cached_model_path(
        os.environ.get("FUNASR_MODEL", "iic/SenseVoiceSmall")
    )
    vad_model = cached_model_path(
        os.environ.get(
            "FUNASR_VAD_MODEL",
            "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch",
        )
    )
    spk_model = cached_model_path(
        os.environ.get(
            "FUNASR_SPK_MODEL",
            "iic/speech_campplus_sv_zh-cn_16k-common",
        )
    )
    device = os.environ.get("FUNASR_DEVICE", "cpu")
    hotwords = hotword_text(read_hotwords())

    try:
        progress(10, "准备音频")
        with redirect_stdout(sys.stderr):
            audio_path, preparation_note, cleanup_paths = prepare_audio_for_demo(original_audio_path)
        progress(25, "加载 FunASR 模型")
        with redirect_stdout(sys.stderr):
            model = AutoModel(
                model=model_name,
                vad_model=vad_model,
                spk_model=spk_model,
                device=device,
                disable_update=True,
            )
        progress(45, "正在语音识别和说话人分离" + ("（已带入热词）" if hotwords else ""))
        with redirect_stdout(sys.stderr):
            generate_args = {
                "input": audio_path,
                "batch_size_s": 300,
            }
            if hotwords:
                generate_args["hotword"] = hotwords
            try:
                result = model.generate(**generate_args)
            except TypeError:
                generate_args.pop("hotword", None)
                result = model.generate(**generate_args)
        progress(85, "整理转录片段")
    except Exception as exc:
        emit({"error": "FunASR 转录失败：" + str(exc)}, 4)
    finally:
        for prepared_path in cleanup_paths:
            try:
                os.unlink(prepared_path)
            except OSError:
                pass

    if not result:
        emit({"segments": []})

    first = result[0]
    segments = normalize_sentence_info(first)
    if not segments:
        segments = normalize_plain_text(first)

    with redirect_stdout(sys.stderr):
        for segment in segments:
            segment["text"] = rich_transcription_postprocess(segment["text"])

    progress(100, "转写完成")
    emit({"segments": segments, "note": preparation_note})


if __name__ == "__main__":
    main()

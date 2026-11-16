import { useEffect, useRef, useState } from "react";
import { useAudio } from "./AudioProvider.js";
import type { MediaChannel } from "./audio.js";
import {
  type AudioCatalog,
  addAudioEntry,
  audioCatalogError,
  changeAudioEntry,
  emptyAudioCatalog,
  readAudioCatalog,
  removeAudioEntry,
  writeAudioCatalog,
} from "./audio-catalog.js";

function initialCatalog() {
  try {
    return readAudioCatalog(window.localStorage);
  } catch {
    return {
      catalog: emptyAudioCatalog(),
      warning:
        "음원 목록 저장소에 접근할 수 없습니다. 파일 직접 선택은 사용할 수 있습니다.",
    };
  }
}

type AudioChannel = Exclude<MediaChannel, "video">;

const channels = ["bgm", "voice"] as const;
const labels = { bgm: "BGM", voice: "음성" };
type Selection = { url: string; name: string; file: File };
type TrackView = {
  name: string;
  phase: string;
  error: string | null;
  selected: boolean;
};
const initialView = (): TrackView => ({
  name: "선택한 파일 없음",
  phase: "대기",
  error: null,
  selected: false,
});

export function MediaPanel() {
  const { audioRef } = useAudio();
  const selections = useRef<Record<AudioChannel, Selection | null>>({
    bgm: null,
    voice: null,
  });
  const requests = useRef({ bgm: 0, voice: 0 });
  const [initial] = useState(initialCatalog);
  const [catalog, setCatalog] = useState(initial.catalog);
  const catalogRef = useRef(initial.catalog);
  const [catalogError, setCatalogError] = useState<string | null>(
    initial.warning,
  );
  const [catalogStatus, setCatalogStatus] = useState("");
  const [selectedIds, setSelectedIds] = useState({ bgm: "", voice: "" });
  const selectedIdsRef = useRef({ bgm: "", voice: "" });
  const [draftNames, setDraftNames] = useState({ bgm: "", voice: "" });
  const bindings = useRef(new Map<string, File>());
  const [connectedIds, setConnectedIds] = useState(new Set<string>());
  const [tracks, setTracks] = useState({
    bgm: initialView(),
    voice: initialView(),
  });

  function update(channel: AudioChannel, patch: Partial<TrackView>) {
    setTracks((current) => ({
      ...current,
      [channel]: { ...current[channel], ...patch },
    }));
  }

  useEffect(
    () => () => {
      bindings.current.clear();
      for (const channel of channels) {
        requests.current[channel] += 1;
        audioRef.current?.stopMedia(channel);
        const selected = selections.current[channel];
        if (selected) URL.revokeObjectURL(selected.url);
      }
    },
    [audioRef],
  );

  function select(channel: AudioChannel, file: File | undefined) {
    if (!file) return;
    if (
      !file.type.startsWith("audio/") &&
      !/\.(wav|mp3|ogg|m4a|aac|flac|webm)$/i.test(file.name)
    ) {
      update(channel, { error: "재생할 음원 파일을 선택해 주세요." });
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      update(channel, { error: "파일을 열지 못했습니다. 다시 선택해 주세요." });
      return;
    }
    const id = selectedIdsRef.current[channel];
    if (id) {
      try {
        commit(
          changeAudioEntry(catalogRef.current, id, { fileName: file.name }),
        );
        bindings.current.set(id, file);
        setConnectedIds((current) => new Set(current).add(id));
      } catch (error) {
        URL.revokeObjectURL(url);
        setCatalogStatus("");
        setCatalogError(audioCatalogError(error));
        return;
      }
    }
    requests.current[channel] += 1;
    audioRef.current?.stopMedia(channel);
    const previous = selections.current[channel];
    selections.current[channel] = { url, name: file.name, file };
    if (previous) URL.revokeObjectURL(previous.url);
    if (!draftNames[channel].trim())
      setDraftNames((current) => ({
        ...current,
        [channel]: file.name.replace(/\.[^.]+$/, ""),
      }));
    update(channel, {
      name: file.name,
      phase: "준비",
      error: null,
      selected: true,
    });
  }

  function commit(next: AudioCatalog) {
    writeAudioCatalog(window.localStorage, next);
    catalogRef.current = next;
    setCatalog(next);
    setCatalogError(null);
    setCatalogStatus("음원 목록을 저장했습니다.");
  }

  function chooseEntry(channel: AudioChannel, id: string) {
    const entry = catalogRef.current.entries.find(
      (entry) => entry.id === id && entry.kind === channel,
    );
    if (id && !entry) return;
    const file = id ? bindings.current.get(id) : undefined;
    let url: string | null = null;
    try {
      if (file) url = URL.createObjectURL(file);
    } catch {
      update(channel, { error: "파일 연결을 열지 못했습니다." });
      return;
    }
    requests.current[channel] += 1;
    audioRef.current?.stopMedia(channel);
    const previous = selections.current[channel];
    if (previous) URL.revokeObjectURL(previous.url);
    selections.current[channel] =
      file && url ? { url, name: file.name, file } : null;
    selectedIdsRef.current[channel] = id;
    setSelectedIds((current) => ({ ...current, [channel]: id }));
    setDraftNames((current) => ({ ...current, [channel]: entry?.name ?? "" }));
    update(channel, {
      name:
        file?.name ??
        (entry?.fileName
          ? `${entry.fileName} — 다시 연결 필요`
          : "선택한 파일 없음"),
      phase: file ? "준비" : id ? "파일 연결 필요" : "대기",
      selected: Boolean(file),
      error: null,
    });
  }

  function addEntry(channel: AudioChannel) {
    try {
      const selected = selections.current[channel];
      const id = crypto.randomUUID();
      const next = addAudioEntry(catalogRef.current, {
        id,
        kind: channel,
        name: draftNames[channel],
        fileName: selected?.name ?? null,
      });
      commit(next);
      if (selected) {
        bindings.current.set(id, selected.file);
        setConnectedIds((current) => new Set(current).add(id));
      }
      selectedIdsRef.current[channel] = id;
      setSelectedIds((current) => ({ ...current, [channel]: id }));
      setDraftNames((current) => ({
        ...current,
        [channel]: next.entries.find((entry) => entry.id === id)?.name ?? "",
      }));
      if (!selected)
        update(channel, { ...initialView(), phase: "파일 연결 필요" });
    } catch (error) {
      setCatalogError(audioCatalogError(error));
      setCatalogStatus("");
    }
  }

  function renameEntry(channel: AudioChannel) {
    try {
      const id = selectedIdsRef.current[channel];
      const next = changeAudioEntry(catalogRef.current, id, {
        name: draftNames[channel],
      });
      commit(next);
      setDraftNames((current) => ({
        ...current,
        [channel]: next.entries.find((entry) => entry.id === id)?.name ?? "",
      }));
    } catch (error) {
      setCatalogError(audioCatalogError(error));
      setCatalogStatus("");
    }
  }

  function removeEntry(channel: AudioChannel) {
    try {
      const id = selectedIdsRef.current[channel];
      commit(removeAudioEntry(catalogRef.current, id));
      chooseEntry(channel, "");
      bindings.current.delete(id);
      setConnectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (error) {
      setCatalogError(audioCatalogError(error));
      setCatalogStatus("");
    }
  }

  function stop(channel: AudioChannel) {
    requests.current[channel] += 1;
    audioRef.current?.stopMedia(channel);
    update(channel, { phase: "정지", error: null });
  }

  async function play(channel: AudioChannel) {
    const selection = selections.current[channel];
    const audio = audioRef.current;
    if (!selection || !audio) return;
    const request = ++requests.current[channel];
    let finished = false;
    update(channel, { phase: "재생 준비 중", error: null });
    const failed = () => {
      finished = true;
      if (requests.current[channel] === request)
        update(channel, {
          phase: "재생 실패",
          error:
            "음원을 재생하지 못했습니다. 파일 형식이나 브라우저 재생 권한을 확인해 주세요.",
        });
    };
    try {
      const started = await audio.playMedia(
        channel,
        selection.url,
        () => {
          finished = true;
          if (requests.current[channel] === request)
            update(channel, { phase: "재생 완료" });
        },
        failed,
      );
      if (!finished && requests.current[channel] === request)
        update(channel, { phase: started ? "재생 중" : "정지" });
    } catch {
      failed();
    }
  }

  return (
    <section className="panel" aria-label="BGM과 음성 재생">
      <h2>BGM과 음성</h2>
      <p className="hint">
        파일을 선택하고 재생을 눌러 주세요. BGM은 반복하고 음성은 한 번
        재생합니다.
      </p>
      <p className="hint">
        선택한 파일은 이 브라우저에서만 재생되며 서버에 업로드하지 않습니다.
        전체 음량과 소리 끄기는 설정 메뉴에서 조절합니다.
      </p>
      <p className="hint">
        이름과 연결 파일명은 이 브라우저에 저장됩니다. 새로고침 후 파일은 다시
        연결해야 합니다. 목록에서 제거해도 원본 파일은 삭제하지 않습니다.
      </p>
      <p aria-live="polite" data-testid="audio-catalog-status">
        {catalogStatus}
      </p>
      {catalogError ? <p role="alert">{catalogError}</p> : null}
      {channels.map((channel) => (
        <fieldset key={channel} className="media-track">
          <legend>{labels[channel]}</legend>
          <label>
            {labels[channel]} 음원 목록
            <select
              value={selectedIds[channel]}
              onChange={(event) =>
                chooseEntry(channel, event.currentTarget.value)
              }
            >
              <option value="">파일 직접 선택</option>
              {catalog.entries
                .filter((entry) => entry.kind === channel)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {connectedIds.has(entry.id) ? "" : " (파일 연결 필요)"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {labels[channel]} 이름
            <input
              type="text"
              maxLength={80}
              value={draftNames[channel]}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setDraftNames((current) => ({ ...current, [channel]: name }));
              }}
            />
          </label>
          <div className="media-actions">
            <button type="button" onClick={() => addEntry(channel)}>
              {labels[channel]} 목록 추가
            </button>
            <button
              type="button"
              onClick={() => renameEntry(channel)}
              disabled={!selectedIds[channel]}
            >
              {labels[channel]} 이름 변경
            </button>
            <button
              type="button"
              onClick={() => removeEntry(channel)}
              disabled={!selectedIds[channel]}
            >
              {labels[channel]} 목록에서 제거
            </button>
          </div>
          <label>
            {labels[channel]} 파일
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac,.webm"
              onChange={(event) => {
                select(channel, event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <p>{tracks[channel].name}</p>
          <div className="media-actions">
            <button
              type="button"
              onClick={() => void play(channel)}
              disabled={
                !tracks[channel].selected ||
                tracks[channel].phase === "재생 준비 중"
              }
            >
              {labels[channel]} 재생
            </button>
            <button
              type="button"
              onClick={() => stop(channel)}
              disabled={!tracks[channel].selected}
            >
              {labels[channel]} 정지
            </button>
          </div>
          <p aria-live="polite" data-testid={`${channel}-status`}>
            {tracks[channel].phase}
          </p>
          {tracks[channel].error ? (
            <p role="alert">{tracks[channel].error}</p>
          ) : null}
        </fieldset>
      ))}
    </section>
  );
}

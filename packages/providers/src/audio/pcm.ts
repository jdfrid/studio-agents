export interface PcmFormat {
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
}

export function isRawPcmMimeType(mimeType: string): boolean {
  const lower = mimeType.toLowerCase();
  return lower.startsWith("audio/l16") || lower.includes("codec=pcm") || lower === "audio/pcm";
}

export function parsePcmMimeType(mimeType: string): PcmFormat {
  const rateMatch = /rate=(\d+)/i.exec(mimeType);
  const bitsMatch = /(?:bits=(\d+)|l16)/i.exec(mimeType);
  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
    bitsPerSample: bitsMatch?.[1] ? Number(bitsMatch[1]) : 16,
    channels: 1
  };
}

export function pcmToWav(pcm: Buffer, format: PcmFormat): Buffer {
  const { sampleRate, bitsPerSample, channels } = format;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function normalizeAudioForPlayback(body: Buffer, mimeType: string): { body: Buffer; mimeType: string; extension: string } {
  if (!isRawPcmMimeType(mimeType)) {
    if (mimeType === "audio/mpeg" || mimeType === "audio/mp3") {
      return { body, mimeType: "audio/mpeg", extension: "mp3" };
    }
    if (mimeType === "audio/wav" || mimeType === "audio/wave") {
      return { body, mimeType: "audio/wav", extension: "wav" };
    }
    return { body, mimeType, extension: "bin" };
  }
  const format = parsePcmMimeType(mimeType);
  return {
    body: pcmToWav(body, format),
    mimeType: "audio/wav",
    extension: "wav"
  };
}

/** Concatenate WAV clips that share the same PCM format (Gemini TTS output). */
export function concatWavBuffers(parts: Buffer[]): Buffer {
  if (parts.length === 0) throw new Error("concatWavBuffers requires at least one buffer");
  if (parts.length === 1) return parts[0]!;
  const pcmChunks: Buffer[] = [];
  let format: PcmFormat | null = null;
  for (const part of parts) {
    const extracted = extractWavPcm(part);
    if (!format) format = extracted.format;
    else if (
      format.sampleRate !== extracted.format.sampleRate ||
      format.bitsPerSample !== extracted.format.bitsPerSample ||
      format.channels !== extracted.format.channels
    ) {
      throw new Error("concatWavBuffers: mismatched WAV formats");
    }
    pcmChunks.push(extracted.pcm);
  }
  return pcmToWav(Buffer.concat(pcmChunks), format!);
}

/** Duration in seconds from a WAV buffer (PCM). */
export function wavDurationSeconds(wav: Buffer): number | null {
  try {
    const { pcm, format } = extractWavPcm(wav);
    const bytesPerSample = (format.bitsPerSample / 8) * format.channels;
    if (bytesPerSample <= 0 || format.sampleRate <= 0) return null;
    const seconds = pcm.length / (format.sampleRate * bytesPerSample);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

function extractWavPcm(wav: Buffer): { pcm: Buffer; format: PcmFormat } {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("extractWavPcm: not a RIFF/WAV buffer");
  }
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      return {
        pcm: wav.subarray(offset + 8, offset + 8 + size),
        format: { sampleRate, bitsPerSample, channels }
      };
    }
    offset += 8 + size + (size % 2);
  }
  // Fallback: classic 44-byte header
  return {
    pcm: wav.subarray(44),
    format: { sampleRate, bitsPerSample, channels }
  };
}

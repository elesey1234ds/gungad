type SampleName = 'click' | 'chip' | 'win' | 'bigwin' | 'loss' | 'tick' | 'card' | 'gem';

/** Pleasant CC0 samples (Kenney Interface Sounds) + soft synth fallback for boom */
const SAMPLE_SRC: Record<SampleName, string> = {
  click: '/sfx/click.ogg',
  chip: '/sfx/chip.ogg',
  win: '/sfx/win.ogg',
  bigwin: '/sfx/bigwin.ogg',
  loss: '/sfx/loss.ogg',
  tick: '/sfx/tick.ogg',
  card: '/sfx/card.ogg',
  gem: '/sfx/gem.ogg',
};

const SAMPLE_VOL: Record<SampleName, number> = {
  click: 0.8,
  chip: 0.9,
  win: 0.9,
  bigwin: 1.0,
  loss: 0.8,
  tick: 0.7,
  card: 0.9,
  gem: 0.9,
};

class SoundController {
  private ctx: AudioContext | null = null;
  private masterFx: GainNode | null = null;
  private isMuted: boolean = false;
  private musicMuted: boolean = false;
  private volume: number = 0.7;
  private musicVolume: number = 0.35;
  private samples: Partial<Record<SampleName, HTMLAudioElement>> = {};
  private musicAudio: HTMLAudioElement | null = null;
  private musicStarted: boolean = false;
  /** Playlist: new track first, legacy after. Auto-advances on ended. */
  private musicTracks = ['/bg-music-2.mp3', '/bg-music.mp3'];
  /** Human-readable track names shown in Settings (index-aligned with musicTracks). */
  private musicTrackNames = ['GunGad Theme', 'Casino Lounge'];
  private musicTrack = 0;

  constructor() {
    this.isMuted = localStorage.getItem('gungad_sound_muted') === 'true';
    this.musicMuted = localStorage.getItem('gungad_music_muted') === 'true';
    const savedVol = parseFloat(localStorage.getItem('gungad_sound_volume') || '');
    const savedMusicVol = parseFloat(localStorage.getItem('gungad_music_volume') || '');
    if (!Number.isNaN(savedVol)) this.volume = Math.min(1, Math.max(0, savedVol));
    if (!Number.isNaN(savedMusicVol)) this.musicVolume = Math.min(1, Math.max(0, savedMusicVol));
    const savedTrack = parseInt(localStorage.getItem('gungad_music_track') || '', 10);
    if (!Number.isNaN(savedTrack)) {
      this.musicTrack = Math.min(this.musicTracks.length - 1, Math.max(0, savedTrack));
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.masterFx && this.ctx) {
      this.masterFx = this.ctx.createGain();
      this.masterFx.gain.value = 1;
      this.masterFx.connect(this.ctx.destination);
    }
  }

  private fxOut(): AudioNode {
    this.initCtx();
    return this.masterFx ?? this.ctx!.destination;
  }

  private fxGain(): number {
    return this.isMuted ? 0 : this.volume;
  }

  /** Kill in-flight FX (e.g. when switching games). Music is untouched. */
  public stopAllFx() {
    if (!this.ctx || !this.masterFx) return;
    try {
      this.masterFx.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterFx.gain.setValueAtTime(0, this.ctx.currentTime);
      this.masterFx.disconnect();
    } catch {
      // ignore
    }
    this.masterFx = this.ctx.createGain();
    this.masterFx.gain.value = 1;
    this.masterFx.connect(this.ctx.destination);
  }

  private playSample(name: SampleName) {
    if (this.isMuted || this.volume <= 0) return;
    try {
      let audio = this.samples[name];
      if (!audio) {
        audio = new Audio(SAMPLE_SRC[name]);
        audio.preload = 'auto';
        this.samples[name] = audio;
      }
      audio.volume = Math.min(1, this.volume * SAMPLE_VOL[name]);
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  private getMusicAudio(): HTMLAudioElement {
    if (!this.musicAudio) {
      this.musicAudio = new Audio(this.musicTracks[this.musicTrack]);
      this.musicAudio.loop = false;
      this.musicAudio.preload = 'auto';
      this.musicAudio.onended = () => {
        // Seamless playlist: next track after current ends
        this.setMusicTrack((this.musicTrack + 1) % this.musicTracks.length, true);
      };
    }
    this.musicAudio.volume = this.musicMuted ? 0 : this.musicVolume;
    return this.musicAudio;
  }

  public getMusicTrack(): number {
    return this.musicTrack;
  }

  public getMusicTrackCount(): number {
    return this.musicTracks.length;
  }

  public getMusicTrackName(idx: number = this.musicTrack): string {
    const i = Math.min(this.musicTrackNames.length - 1, Math.max(0, idx));
    return this.musicTrackNames[i] ?? `Track ${i + 1}`;
  }

  /** Stop and detach the current music element so it can never overlap the next one. */
  private killMusicAudio() {
    const old = this.musicAudio;
    this.musicAudio = null;
    if (!old) return;
    try {
      old.onended = null;
      old.pause();
      old.removeAttribute('src');
      try {
        old.load();
      } catch {
        /* ignore — just forces resource release */
      }
    } catch {
      /* ignore */
    }
  }

  /** Switch track (keeps playing state). Returns new index. */
  public setMusicTrack(idx: number, autoplay = true): number {
    this.musicTrack = Math.min(this.musicTracks.length - 1, Math.max(0, idx));
    localStorage.setItem('gungad_music_track', String(this.musicTrack));
    const wasPlaying = Boolean(this.musicAudio && !this.musicAudio.paused);
    // IMPORTANT: stop the old element first — otherwise both tracks play at once.
    this.killMusicAudio();
    if ((wasPlaying && autoplay) || this.musicStarted) {
      if (this.musicMuted) return this.musicTrack;
      const m = this.getMusicAudio();
      m.volume = this.musicVolume;
      void m.play().catch(() => {});
    }
    return this.musicTrack;
  }

  public nextMusicTrack(): number {
    this.playClick();
    return this.setMusicTrack((this.musicTrack + 1) % this.musicTracks.length);
  }

  public prevMusicTrack(): number {
    this.playClick();
    return this.setMusicTrack(
      (this.musicTrack - 1 + this.musicTracks.length) % this.musicTracks.length,
    );
  }

  /** Call once after first user gesture to unlock autoplay */
  public unlockAndStartMusic() {
    if (this.musicStarted && !this.musicMuted) {
      const m = this.getMusicAudio();
      if (m.paused) void m.play().catch(() => {});
      return;
    }
    this.musicStarted = true;
    if (this.musicMuted) return;
    const m = this.getMusicAudio();
    void m.play().catch(() => {});
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('gungad_sound_muted', String(this.isMuted));
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('gungad_sound_muted', String(this.isMuted));
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    localStorage.setItem('gungad_music_muted', String(this.musicMuted));
    const m = this.getMusicAudio();
    if (this.musicMuted) {
      m.pause();
    } else {
      this.musicStarted = true;
      m.volume = this.musicVolume;
      void m.play().catch(() => {});
    }
    return this.musicMuted;
  }

  public setMusicMuted(muted: boolean) {
    this.musicMuted = muted;
    localStorage.setItem('gungad_music_muted', String(this.musicMuted));
    const m = this.getMusicAudio();
    if (muted) m.pause();
    else {
      m.volume = this.musicVolume;
      void m.play().catch(() => {});
    }
  }

  public getMusicMuted(): boolean {
    return this.musicMuted;
  }

  public setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem('gungad_sound_volume', String(this.volume));
    (Object.keys(this.samples) as SampleName[]).forEach((name) => {
      const audio = this.samples[name];
      if (audio) audio.volume = Math.min(1, this.volume * SAMPLE_VOL[name]);
    });
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMusicVolume(v: number) {
    this.musicVolume = Math.min(1, Math.max(0, v));
    localStorage.setItem('gungad_music_volume', String(this.musicVolume));
    if (this.musicAudio) {
      this.musicAudio.volume = this.musicMuted ? 0 : this.musicVolume;
    }
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public playClick() {
    this.playSample('click');
  }

  public playChip() {
    this.playSample('chip');
  }

  public playWin() {
    this.playSample('win');
  }

  public playBigWin() {
    this.playSample('bigwin');
  }

  public playLoss() {
    this.playSample('loss');
  }

  public playSpinTick() {
    this.playSample('tick');
  }

  public playCard() {
    this.playSample('card');
  }

  public playExplosion() {
    if (this.isMuted || this.volume <= 0) return;
    this.initCtx();
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.4);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3 * this.volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);
    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.fxOut());
    whiteNoise.start();
    whiteNoise.stop(this.ctx.currentTime + 0.4);
  }

  public playGem() {
    this.playSample('gem');
  }
}

export const soundFx = new SoundController();

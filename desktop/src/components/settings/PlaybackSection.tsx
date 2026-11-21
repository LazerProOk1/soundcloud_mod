import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { switchAudioDevice } from '../../lib/audio';
import { trackedInvoke } from '../../lib/diagnostics';
import { type DiscordRpcMode, useSettingsStore } from '../../stores/settings';
import { LiquidSwitch } from '../ui/LiquidSwitch';
import { Segmented } from '../ui/Segmented';
import { SettingRow, SettingsSection } from './SettingsKit';

interface AudioSink {
  name: string;
  description: string;
  is_default: boolean;
}

/** Output device picker; hidden when the engine reports no devices. */
function AudioDeviceRow() {
  const { t } = useTranslation();
  const [sinks, setSinks] = useState<AudioSink[]>([]);
  const [switching, setSwitching] = useState(false);

  const refreshSinks = useCallback(() => {
    trackedInvoke<AudioSink[]>('audio_list_devices').then(setSinks).catch(console.error);
  }, []);

  // Refresh on mount and when the window regains focus (the device may have changed).
  useEffect(() => {
    refreshSinks();
    window.addEventListener('focus', refreshSinks);
    return () => window.removeEventListener('focus', refreshSinks);
  }, [refreshSinks]);

  const handleSwitch = async (sinkName: string) => {
    const current = sinks.find((s) => s.is_default);
    if (switching || current?.name === sinkName) return;
    setSwitching(true);
    try {
      await switchAudioDevice(sinkName, true);
      setSinks((prev) => prev.map((s) => ({ ...s, is_default: s.name === sinkName })));
      toast.success(t('settings.audioDeviceSwitched'));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSwitching(false);
    }
  };

  if (sinks.length === 0) return null;
  return (
    <SettingRow title={t('settings.audioDevice')} stacked>
      <Segmented
        value={sinks.find((s) => s.is_default)?.name ?? ''}
        options={sinks.map((sink) => ({ id: sink.name, label: sink.description }))}
        onChange={(name) => void handleSwitch(name)}
      />
    </SettingRow>
  );
}

export const PlaybackSection = React.memo(function PlaybackSection() {
  const { t } = useTranslation();
  const lyricsVisualizer = useSettingsStore((s) => s.lyricsVisualizer);
  const setLyricsVisualizer = useSettingsStore((s) => s.setLyricsVisualizer);
  const normalizeVolume = useSettingsStore((s) => s.normalizeVolume);
  const setNormalizeVolume = useSettingsStore((s) => s.setNormalizeVolume);
  const highQualityStreaming = useSettingsStore((s) => s.highQualityStreaming);
  const setHighQualityStreaming = useSettingsStore((s) => s.setHighQualityStreaming);

  return (
    <SettingsSection id="playback" title={t('settings.playback')}>
      <AudioDeviceRow />
      <SettingRow
        title={t('settings.highQualityStreaming')}
        desc={t('settings.highQualityStreamingDesc')}
      >
        <LiquidSwitch checked={highQualityStreaming} onChange={setHighQualityStreaming} />
      </SettingRow>
      <SettingRow title={t('settings.normalizeVolume')} desc={t('settings.normalizeVolumeDesc')}>
        <LiquidSwitch checked={normalizeVolume} onChange={setNormalizeVolume} />
      </SettingRow>
      <SettingRow title={t('settings.lyricsVisualizer')} desc={t('settings.lyricsVisualizerDesc')}>
        <LiquidSwitch checked={lyricsVisualizer} onChange={setLyricsVisualizer} />
      </SettingRow>
    </SettingsSection>
  );
});

const DISCORD_RPC_MODES: Array<{ id: DiscordRpcMode; labelKey: string }> = [
  { id: 'track', labelKey: 'settings.discordRpcModeTrack' },
  { id: 'artist', labelKey: 'settings.discordRpcModeArtist' },
  { id: 'activity', labelKey: 'settings.discordRpcModeActivity' },
];

export const DiscordSection = React.memo(function DiscordSection() {
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.discordRpcEnabled);
  const setEnabled = useSettingsStore((s) => s.setDiscordRpcEnabled);
  const mode = useSettingsStore((s) => s.discordRpcMode);
  const setMode = useSettingsStore((s) => s.setDiscordRpcMode);
  const showButton = useSettingsStore((s) => s.discordRpcShowButton);
  const setShowButton = useSettingsStore((s) => s.setDiscordRpcShowButton);

  return (
    <SettingsSection id="discord" title="Discord">
      <SettingRow title={t('settings.discordRpc')} desc={t('settings.discordRpcDesc')}>
        <LiquidSwitch checked={enabled} onChange={setEnabled} />
      </SettingRow>
      {enabled && (
        <>
          <SettingRow title={t('settings.discordRpcMode')} stacked>
            <Segmented
              value={mode}
              options={DISCORD_RPC_MODES.map((m) => ({ id: m.id, label: t(m.labelKey) }))}
              onChange={setMode}
            />
          </SettingRow>
          <SettingRow
            title={t('settings.discordRpcButton')}
            desc={t('settings.discordRpcButtonDesc')}
          >
            <LiquidSwitch checked={showButton} onChange={setShowButton} />
          </SettingRow>
        </>
      )}
    </SettingsSection>
  );
});

import { useState, useEffect, useMemo } from 'react';
import { useStore, type AppSettings, type ProviderId } from '../../models/store';
import { t } from '../../services/i18n';
import { api } from '../../services/api';
import {
  fetchProviders,
  detectProviderFromBaseUrl,
  FALLBACK_PROVIDERS,
  type ProviderPreset,
} from '../../services/llmProviders';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import CloseIcon from '@mui/icons-material/Close';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import LinkIcon from '@mui/icons-material/Link';
import WidgetsIcon from '@mui/icons-material/Widgets';
import TagIcon from '@mui/icons-material/Tag';
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat';
import StraightenIcon from '@mui/icons-material/Straighten';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import DnsIcon from '@mui/icons-material/Dns';

type Props = { isOpen: boolean; onClose: () => void };

export function SettingsModal({ isOpen, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const language = useStore((s) => s.language);
  const tr = t(language);

  const [providers, setProviders] = useState<ProviderPreset[]>(FALLBACK_PROVIDERS);

  const [chatProvider, setChatProvider] = useState<ProviderId>(
    settings.chat.provider ?? 'custom',
  );
  const [chatApiKey, setChatApiKey] = useState(settings.chat.apiKey);
  const [chatBaseUrl, setChatBaseUrl] = useState(settings.chat.baseUrl);
  const [chatModel, setChatModel] = useState(settings.chat.model);
  const [chatMaxTokens, setChatMaxTokens] = useState(settings.chat.maxTokens ?? 4096);
  const [chatTemperature, setChatTemperature] = useState(settings.chat.temperature ?? 0.1);
  const [showChatKey, setShowChatKey] = useState(false);

  const [embProvider, setEmbProvider] = useState<ProviderId>(
    settings.embedding.provider ?? 'custom',
  );
  const [embApiKey, setEmbApiKey] = useState(settings.embedding.apiKey);
  const [embBaseUrl, setEmbBaseUrl] = useState(settings.embedding.baseUrl);
  const [embModel, setEmbModel] = useState(settings.embedding.model);
  const [embDimension, setEmbDimension] = useState(settings.embedding.dimension ?? 4096);
  const [showEmbKey, setShowEmbKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | {
    chat: { ok: boolean; error?: string; model?: string; provider?: string };
    embedding: {
      ok: boolean;
      error?: string;
      dimension?: number;
      provider?: string;
      sent_dimensions_kwarg?: boolean;
    };
  }>(null);

  // Resolve presets for the two sections separately so each dropdown can
  // surface its own metadata (model lists, native dim, locked dimensions).
  const chatPreset = useMemo(
    () => providers.find((p) => p.id === chatProvider) ?? null,
    [providers, chatProvider],
  );
  const embPreset = useMemo(
    () => providers.find((p) => p.id === embProvider) ?? null,
    [providers, embProvider],
  );

  // Sync local form state whenever the modal opens or the saved settings
  // change. We also refresh provider data from the backend on open so a
  // running deployment can amend the recommended-model lists without
  // forcing a frontend rebuild.
  useEffect(() => {
    if (!isOpen) return;
    setChatApiKey(settings.chat.apiKey);
    setChatBaseUrl(settings.chat.baseUrl);
    setChatModel(settings.chat.model);
    setChatMaxTokens(settings.chat.maxTokens ?? 4096);
    setChatTemperature(settings.chat.temperature ?? 0.1);
    setEmbApiKey(settings.embedding.apiKey);
    setEmbBaseUrl(settings.embedding.baseUrl);
    setEmbModel(settings.embedding.model);
    setEmbDimension(settings.embedding.dimension ?? 4096);

    let cancelled = false;
    void fetchProviders().then((list) => {
      if (cancelled) return;
      setProviders(list);
      // Pre-select the saved provider, or infer it from the base URL for
      // pre-existing user configs that never carried a `provider` field.
      const initialChat: ProviderId =
        settings.chat.provider ??
        detectProviderFromBaseUrl(settings.chat.baseUrl, list) ??
        'custom';
      const initialEmb: ProviderId =
        settings.embedding.provider ??
        detectProviderFromBaseUrl(settings.embedding.baseUrl, list) ??
        'custom';
      setChatProvider(initialChat);
      setEmbProvider(initialEmb);
    });
    return () => {
      cancelled = true;
    };
  }, [settings, isOpen]);

  const handleSelectChatProvider = (id: ProviderId) => {
    setChatProvider(id);
    if (id === 'custom') return;
    const preset = providers.find((p) => p.id === id);
    if (!preset) return;
    if (preset.default_chat_base_url) setChatBaseUrl(preset.default_chat_base_url);
    if (preset.recommended_chat_models[0]) {
      setChatModel(preset.recommended_chat_models[0]);
    }
  };

  const handleSelectEmbProvider = (id: ProviderId) => {
    setEmbProvider(id);
    if (id === 'custom') return;
    const preset = providers.find((p) => p.id === id);
    if (!preset) return;
    if (preset.default_embed_base_url) setEmbBaseUrl(preset.default_embed_base_url);
    if (preset.recommended_embed_models[0]) {
      setEmbModel(preset.recommended_embed_models[0]);
    }
    if (preset.embed_native_dim > 0) setEmbDimension(preset.embed_native_dim);
  };

  const handleSave = () => {
    const next: AppSettings = {
      chat: {
        apiKey: chatApiKey,
        baseUrl: chatBaseUrl,
        model: chatModel,
        maxTokens: chatMaxTokens,
        temperature: chatTemperature,
        provider: chatProvider,
      },
      embedding: {
        apiKey: embApiKey,
        baseUrl: embBaseUrl,
        model: embModel,
        dimension: embDimension,
        provider: embProvider,
      },
    };
    updateSettings(next);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnectivity(
        {
          api_key: chatApiKey,
          base_url: chatBaseUrl,
          model: chatModel,
          provider: chatProvider,
        },
        {
          api_key: embApiKey,
          base_url: embBaseUrl,
          model: embModel,
          dimension: embDimension,
          provider: embProvider,
        },
      );
      setTestResult(result);
    } catch {
      setTestResult({
        chat: { ok: false, error: 'Request failed' },
        embedding: { ok: false, error: 'Request failed' },
      });
    } finally {
      setTesting(false);
    }
  };

  const renderProviderLabel = (p: ProviderPreset) =>
    language === 'zh' ? p.label : p.label_en || p.label;

  const dimensionLocked =
    embPreset !== null && embPreset.id !== 'custom' && !embPreset.embed_supports_dimensions;

  // Shared sx for consistent input styling
  const textFieldSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#030712',
      borderRadius: 2,
      '& fieldset': { borderColor: 'divider' },
      '&:hover fieldset': { borderColor: 'primary.main' },
      '&.Mui-focused fieldset': { borderColor: 'primary.main' },
    },
    '& .MuiInputBase-input': {
      color: '#fff',
      fontSize: '0.875rem',
      '&::placeholder': { color: 'text.disabled', opacity: 1 },
    },
  };

  const labelSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'text.disabled',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    mb: 0.5,
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          maxHeight: '85vh',
          backgroundImage: 'none',
        },
      }}
    >
      {/* Title */}
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.025em' }}>
          {tr.settings.title}
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'text.disabled', bgcolor: 'background.default', '&:hover': { color: 'text.primary' } }}>
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      {/* Content */}
      <DialogContent sx={{ px: 3, py: 3, '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* ===== Chat Model ===== */}
          <Box component="section">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <MemoryIcon sx={{ fontSize: 20, color: 'primary.light' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tr.settings.chatModel}
              </Typography>
            </Box>

            {/* Provider dropdown */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={labelSx}>
                <DnsIcon sx={{ fontSize: 14 }} /> {tr.settings.provider}
              </Typography>
              <Select
                value={chatProvider}
                onChange={(e) => handleSelectChatProvider(e.target.value as ProviderId)}
                fullWidth
                size="small"
                sx={{
                  bgcolor: '#030712',
                  color: '#fff',
                  borderRadius: 2,
                  fontSize: '0.875rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  '& .MuiSelect-icon': { color: 'text.disabled' },
                }}
              >
                {providers.map((p) => (
                  <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.875rem' }}>
                    {renderProviderLabel(p)}
                  </MenuItem>
                ))}
              </Select>
              <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled', mt: 0.5, lineHeight: 1.3 }}>
                {chatPreset?.notes && chatProvider !== 'custom'
                  ? chatPreset.notes
                  : tr.settings.providerHint}
              </Typography>
            </Box>

            {/* API Key */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={labelSx}>
                <VpnKeyIcon sx={{ fontSize: 14 }} /> {tr.settings.apiKey}
              </Typography>
              <TextField
                type={showChatKey ? 'text' : 'password'}
                value={chatApiKey}
                onChange={(e) => setChatApiKey(e.target.value)}
                placeholder="sk-..."
                fullWidth
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowChatKey(!showChatKey)}
                        edge="end"
                        size="small"
                        sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                      >
                        {showChatKey ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={textFieldSx}
              />
            </Box>

            {/* Base URL */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={labelSx}>
                <LinkIcon sx={{ fontSize: 14 }} /> {tr.settings.baseUrl}
              </Typography>
              <TextField
                value={chatBaseUrl}
                onChange={(e) => setChatBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                fullWidth
                size="small"
                sx={textFieldSx}
              />
            </Box>

            {/* Model name + Max tokens grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
              <Box>
                <Typography sx={labelSx}>
                  <WidgetsIcon sx={{ fontSize: 14 }} /> {tr.settings.modelName}
                </Typography>
                <TextField
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  placeholder="gpt-4o"
                  fullWidth
                  size="small"
                  sx={textFieldSx}
                />
              </Box>
              <Box>
                <Typography sx={labelSx}>
                  <TagIcon sx={{ fontSize: 14 }} /> {tr.settings.maxTokens}
                </Typography>
                <TextField
                  type="number"
                  value={chatMaxTokens}
                  onChange={(e) => setChatMaxTokens(Number(e.target.value))}
                  inputProps={{ min: 256, max: 32768, step: 256 }}
                  fullWidth
                  size="small"
                  sx={textFieldSx}
                />
              </Box>
            </Box>

            {/* Recommended chat models */}
            {chatPreset && chatPreset.recommended_chat_models.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>
                  {tr.settings.recommendedModels}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {chatPreset.recommended_chat_models.map((m) => {
                    const active = m === chatModel;
                    return (
                      <Button
                        key={m}
                        size="small"
                        onClick={() => setChatModel(m)}
                        sx={{
                          fontSize: '0.6875rem',
                          fontFamily: '"JetBrains Mono", monospace',
                          px: 1,
                          py: 0.25,
                          minWidth: 0,
                          borderRadius: 1,
                          border: '1px solid',
                          transition: 'all 0.2s',
                          ...(active
                            ? { bgcolor: 'rgba(129,140,248,0.12)', borderColor: 'rgba(129,140,248,0.4)', color: 'primary.light' }
                            : { bgcolor: '#030712', borderColor: 'divider', color: 'text.disabled', '&:hover': { borderColor: 'text.disabled', color: 'text.secondary' } }
                          ),
                        }}
                      >
                        {m}
                      </Button>
                    );
                  })}
                </Box>
              </Box>
            )}

            {/* Temperature */}
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ ...labelSx, mb: 0.5 }}>
                <DeviceThermostatIcon sx={{ fontSize: 14 }} /> {tr.settings.temperature}
                <Typography component="span" sx={{ ml: 'auto', fontSize: '0.75rem', color: 'primary.light', fontWeight: 700 }}>
                  {chatTemperature.toFixed(1)}
                </Typography>
              </Typography>
              <Slider
                value={chatTemperature}
                onChange={(_, val) => setChatTemperature(val as number)}
                min={0}
                max={2}
                step={0.1}
                sx={{
                  color: 'primary.main',
                  '& .MuiSlider-thumb': { width: 16, height: 16 },
                  '& .MuiSlider-track': { height: 6, borderRadius: 3 },
                  '& .MuiSlider-rail': { height: 6, borderRadius: 3, bgcolor: 'background.default' },
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>0 · 精确</Typography>
                <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>1 · 平衡</Typography>
                <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled' }}>2 · 创造</Typography>
              </Box>
            </Box>

            <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', fontWeight: 500, mt: 1 }}>
              {tr.settings.chatDesc}
            </Typography>
          </Box>

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />

          {/* ===== Embedding Model ===== */}
          <Box component="section">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <StorageIcon sx={{ fontSize: 20, color: '#34D399' }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tr.settings.embeddingModel}
              </Typography>
            </Box>

            {/* Provider dropdown */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={labelSx}>
                <DnsIcon sx={{ fontSize: 14 }} /> {tr.settings.provider}
              </Typography>
              <Select
                value={embProvider}
                onChange={(e) => handleSelectEmbProvider(e.target.value as ProviderId)}
                fullWidth
                size="small"
                sx={{
                  bgcolor: '#030712',
                  color: '#fff',
                  borderRadius: 2,
                  fontSize: '0.875rem',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
                  '& .MuiSelect-icon': { color: 'text.disabled' },
                }}
              >
                {providers.map((p) => (
                  <MenuItem key={p.id} value={p.id} sx={{ fontSize: '0.875rem' }}>
                    {renderProviderLabel(p)}
                  </MenuItem>
                ))}
              </Select>
              <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled', mt: 0.5, lineHeight: 1.3 }}>
                {embPreset?.notes && embProvider !== 'custom'
                  ? embPreset.notes
                  : tr.settings.providerHint}
              </Typography>
            </Box>

            {/* API Key */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={labelSx}>
                <VpnKeyIcon sx={{ fontSize: 14 }} /> {tr.settings.apiKey}
              </Typography>
              <TextField
                type={showEmbKey ? 'text' : 'password'}
                value={embApiKey}
                onChange={(e) => setEmbApiKey(e.target.value)}
                placeholder="sk-..."
                fullWidth
                size="small"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowEmbKey(!showEmbKey)}
                        edge="end"
                        size="small"
                        sx={{ color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
                      >
                        {showEmbKey ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={textFieldSx}
              />
            </Box>

            {/* Base URL + Dimension grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
              <Box>
                <Typography sx={labelSx}>
                  <LinkIcon sx={{ fontSize: 14 }} /> {tr.settings.baseUrl}
                </Typography>
                <TextField
                  value={embBaseUrl}
                  onChange={(e) => setEmbBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  fullWidth
                  size="small"
                  sx={textFieldSx}
                />
              </Box>
              <Box>
                <Typography sx={labelSx}>
                  <StraightenIcon sx={{ fontSize: 14 }} /> {tr.settings.dimension}
                </Typography>
                <TextField
                  type="number"
                  value={embDimension}
                  onChange={(e) => setEmbDimension(Number(e.target.value))}
                  disabled={dimensionLocked}
                  inputProps={{ min: 128, max: 8192, step: 128 }}
                  fullWidth
                  size="small"
                  sx={{
                    ...textFieldSx,
                    ...(dimensionLocked ? { '& .MuiInputBase-root': { opacity: 0.5 } } : {}),
                  }}
                />
                {dimensionLocked && embPreset && (
                  <Typography sx={{ fontSize: '0.625rem', color: 'rgba(251,191,36,0.8)', mt: 0.25, lineHeight: 1.3 }}>
                    {tr.settings.dimensionLocked(embPreset.embed_native_dim)}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Model name */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={labelSx}>
                <WidgetsIcon sx={{ fontSize: 14 }} /> {tr.settings.modelName}
              </Typography>
              <TextField
                value={embModel}
                onChange={(e) => setEmbModel(e.target.value)}
                placeholder="text-embedding-3-small"
                fullWidth
                size="small"
                sx={textFieldSx}
              />
            </Box>

            {/* Recommended embedding models */}
            {embPreset && embPreset.recommended_embed_models.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.75 }}>
                  {tr.settings.recommendedModels}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {embPreset.recommended_embed_models.map((m) => {
                    const active = m === embModel;
                    return (
                      <Button
                        key={m}
                        size="small"
                        onClick={() => setEmbModel(m)}
                        sx={{
                          fontSize: '0.6875rem',
                          fontFamily: '"JetBrains Mono", monospace',
                          px: 1,
                          py: 0.25,
                          minWidth: 0,
                          borderRadius: 1,
                          border: '1px solid',
                          transition: 'all 0.2s',
                          ...(active
                            ? { bgcolor: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.4)', color: '#34D399' }
                            : { bgcolor: '#030712', borderColor: 'divider', color: 'text.disabled', '&:hover': { borderColor: 'text.disabled', color: 'text.secondary' } }
                          ),
                        }}
                      >
                        {m}
                      </Button>
                    );
                  })}
                </Box>
              </Box>
            )}

            {/* Multimodal embedding models */}
            {embPreset && embPreset.supports_multimodal_embed && (embPreset.multimodal_embed_models || []).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                  <VisibilityIcon sx={{ fontSize: 14, color: '#C084FC' }} />
                  <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Multimodal Embedding
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {embPreset.multimodal_embed_models!.map((m) => {
                    const active = m === embModel;
                    return (
                      <Button
                        key={m}
                        size="small"
                        onClick={() => setEmbModel(m)}
                        sx={{
                          fontSize: '0.6875rem',
                          fontFamily: '"JetBrains Mono", monospace',
                          px: 1,
                          py: 0.25,
                          minWidth: 0,
                          borderRadius: 1,
                          border: '1px solid',
                          transition: 'all 0.2s',
                          ...(active
                            ? { bgcolor: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.4)', color: '#C084FC' }
                            : { bgcolor: '#030712', borderColor: 'divider', color: 'text.disabled', '&:hover': { borderColor: 'text.disabled', color: 'text.secondary' } }
                          ),
                        }}
                      >
                        {m}
                      </Button>
                    );
                  })}
                </Box>
                <Typography sx={{ fontSize: '0.625rem', color: 'text.disabled', mt: 0.5 }}>
                  使用 DashScope 原生 SDK，支持文本+图像多模态向量化
                </Typography>
              </Box>
            )}

            <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', fontWeight: 500 }}>
              {tr.settings.embedDesc}
            </Typography>
          </Box>
        </Box>

        {/* Test results */}
        {testResult && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Alert
              severity={testResult.chat.ok ? 'success' : 'error'}
              icon={testResult.chat.ok ? <CheckCircleIcon sx={{ fontSize: 18 }} /> : <CancelIcon sx={{ fontSize: 18 }} />}
              sx={{
                borderRadius: 2,
                bgcolor: testResult.chat.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResult.chat.ok ? '#34D399' : '#F87171',
                '& .MuiAlert-icon': { color: 'inherit' },
              }}
            >
              <AlertTitle sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 0 }}>Chat</AlertTitle>
              <Typography sx={{ fontSize: '0.75rem' }}>
                {testResult.chat.ok
                  ? `${tr.settings.testOk} · ${testResult.chat.model || ''}`
                  : `${tr.settings.testFail} · ${testResult.chat.error}`}
              </Typography>
            </Alert>
            <Alert
              severity={testResult.embedding.ok ? 'success' : 'error'}
              icon={testResult.embedding.ok ? <CheckCircleIcon sx={{ fontSize: 18 }} /> : <CancelIcon sx={{ fontSize: 18 }} />}
              sx={{
                borderRadius: 2,
                bgcolor: testResult.embedding.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                color: testResult.embedding.ok ? '#34D399' : '#F87171',
                '& .MuiAlert-icon': { color: 'inherit' },
              }}
            >
              <AlertTitle sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 0 }}>Embedding</AlertTitle>
              <Typography sx={{ fontSize: '0.75rem' }}>
                {testResult.embedding.ok
                  ? `${tr.settings.testOk} · ${testResult.embedding.dimension}d`
                  : `${tr.settings.testFail} · ${testResult.embedding.error}`}
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>

      {/* Actions */}
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'rgba(15,23,42,0.5)' }}>
        <Button
          onClick={handleTest}
          disabled={testing}
          startIcon={<BoltIcon sx={{ fontSize: 16 }} />}
          variant="text"
          sx={{
            fontWeight: 700,
            fontSize: '0.875rem',
            color: 'text.secondary',
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'action.hover' },
            '&.Mui-disabled': { opacity: 0.5 },
          }}
        >
          {testing ? tr.settings.testing : tr.settings.testConn}
        </Button>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            onClick={onClose}
            variant="text"
            sx={{
              fontWeight: 700,
              fontSize: '0.875rem',
              px: 3,
              py: 1,
              color: 'text.secondary',
              bgcolor: 'background.paper',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            {tr.settings.cancel}
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            sx={{
              fontWeight: 700,
              fontSize: '0.875rem',
              px: 4,
              py: 1,
              boxShadow: '0 4px 6px -1px rgba(79,70,229,0.2)',
              '&:hover': { transform: 'scale(1.02)' },
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            {tr.settings.save}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

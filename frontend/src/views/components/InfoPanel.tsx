import { Box, Card, CardContent, Typography, Stack } from '@mui/material';

interface Props {
  projectName: string;
  safetyLevel?: string;
  bomCost?: number;
  components: Array<{ id: string; label: string; type: string }>;
  nodes: Array<{ id: string }>;
}

function fmtNum(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={(theme) => ({
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        p: 2,
        bgcolor: theme.palette.surfaceContainer || 'background.paper',
      })}
    >
      <Typography
        variant="labelSmall"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontFamily: '"JetBrains Mono", monospace',
          color: 'text.disabled',
          display: 'block',
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="headlineSmall"
        sx={{ mt: 0.5, fontWeight: 700 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function InfoPanel({
  projectName,
  safetyLevel,
  bomCost,
  components,
  nodes,
}: Props) {
  const empty =
    !projectName && components.length === 0 && nodes.length === 0;

  if (empty) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
          typography: 'bodyMedium',
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        尚未生成项目概览 — 在左侧对话中描述需求即可。
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        p: 4,
        maxWidth: 768,
        mx: 'auto',
      }}
      className="custom-scrollbar"
    >
      <Typography
        variant="labelSmall"
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.1em',
          color: 'text.disabled',
          textTransform: 'uppercase',
          mb: 1,
          display: 'block',
        }}
      >
        [ fig.00 ] project overview &middot; rev a
      </Typography>
      <Typography variant="headlineMedium" sx={{ mb: 3, fontWeight: 700 }}>
        {projectName || '未命名项目'}
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 4 }}>
        <Stat label="安全等级" value={safetyLevel ?? '—'} />
        <Stat label="估价 (CNY)" value={fmtNum(bomCost)} />
        <Stat label="元器件数" value={String(components.length)} />
      </Stack>
      <Typography
        variant="labelMedium"
        sx={{
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'text.secondary',
          mb: 2,
          display: 'block',
        }}
      >
        元器件清单 ({components.length})
      </Typography>
      {components.length === 0 ? (
        <Typography
          variant="bodyMedium"
          sx={{ fontFamily: '"JetBrains Mono", monospace', color: 'text.disabled' }}
        >
          尚未选型,请向 Volta 描述工艺需求。
        </Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {components.map((c) => (
            <Box
              component="li"
              key={c.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: 1,
                borderColor: 'divider',
                py: 1.5,
              }}
            >
              <Typography
                variant="bodyMedium"
                sx={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {c.label}
              </Typography>
              <Typography
                variant="labelSmall"
                sx={{ color: 'text.disabled', textTransform: 'uppercase' }}
              >
                {c.type}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

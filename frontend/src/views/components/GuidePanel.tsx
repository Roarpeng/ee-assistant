import {
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Avatar,
} from '@mui/material';

export interface GuideStep {
  title: string;
  body: string;
}

interface Props {
  steps: GuideStep[];
}

function StepNumber({ index }: { index: number }) {
  return (
    <Avatar
      sx={{
        width: 36,
        height: 36,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        fontFamily: '"JetBrains Mono", monospace',
        fontWeight: 700,
        fontSize: 14,
        borderRadius: 1.5,
      }}
    >
      {String(index + 1).padStart(2, '0')}
    </Avatar>
  );
}

export function GuidePanel({ steps }: Props) {
  if (steps.length === 0) {
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
        未生成调试指引 — 完成代码生成后将自动产出步骤化指引。
      </Box>
    );
  }
  return (
    <Box
      sx={{ height: '100%', overflow: 'auto', p: 4, maxWidth: 768, mx: 'auto' }}
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
        [ fig.06 ] commissioning &middot; runbook
      </Typography>
      <Typography variant="headlineSmall" sx={{ mb: 4, fontWeight: 700 }}>
        装配 / 调试指引
      </Typography>
      <Stepper orientation="vertical" nonLinear sx={{ ml: -1 }}>
        {steps.map((step, idx) => (
          <Step key={idx} active sx={{ '& .MuiStepConnector-line': { borderColor: 'divider' } }}>
            <StepLabel
              StepIconComponent={() => <StepNumber index={idx} />}
              sx={{
                '& .MuiStepLabel-label': { ml: 1.5 },
              }}
            >
              <Typography variant="titleMedium" sx={{ fontWeight: 700, mb: 0.5 }}>
                {step.title}
              </Typography>
              <Typography
                variant="bodyMedium"
                color="text.secondary"
                sx={{ whiteSpace: 'pre-wrap', mb: 2 }}
              >
                {step.body}
              </Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}

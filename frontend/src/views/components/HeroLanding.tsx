import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import { SettingsModal } from './SettingsModal';

interface Props {
  onSubmit: (prompt: string) => void;
  onOpenKnowledge: () => void;
  examples: string[];
}

export function HeroLanding({ onSubmit, onOpenKnowledge, examples }: Props) {
  const [value, setValue] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        px: 3,
        position: 'relative',
      }}
    >
      {/* Top-right buttons */}
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          zIndex: 50,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<StorageIcon />}
          onClick={onOpenKnowledge}
          title="知识库管理"
          sx={{
            borderColor: 'divider',
            color: 'text.secondary',
            bgcolor: 'surfaceContainer',
            borderRadius: '9999px',
            height: 40,
            px: 2,
            '&:hover': {
              bgcolor: 'surfaceContainerHigh',
              borderColor: 'divider',
              color: 'text.primary',
            },
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: '0.875rem',
              fontWeight: 500,
              display: { xs: 'none', sm: 'inline' },
            }}
          >
            知识库
          </Typography>
        </Button>
        <IconButton
          onClick={() => setIsSettingsOpen(true)}
          title="LLM Settings"
          sx={{
            width: 40,
            height: 40,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'surfaceContainer',
            borderRadius: '50%',
            color: 'text.secondary',
            '&:hover': {
              bgcolor: 'surfaceContainerHigh',
              color: 'text.primary',
            },
          }}
        >
          <SettingsIcon />
        </IconButton>
      </Box>

      <Box sx={{ width: '100%', maxWidth: 560 }}>
        <Typography
          sx={{
            fontSize: '0.625rem',
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: '0.1em',
            color: 'text.disabled',
            textTransform: 'uppercase',
            mb: 2,
          }}
        >
          [ fig.01 ] volta · ee assistant
        </Typography>

        <Typography
          sx={{
            fontSize: '2.25rem',
            fontWeight: 700,
            mb: 1,
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
          }}
        >
          你想设计什么电气方案?
        </Typography>

        <Typography
          sx={{
            color: 'text.secondary',
            mb: 3,
            fontSize: '1rem',
            lineHeight: 1.6,
          }}
        >
          用一句话描述你的工艺/控制目标 — Volta 会拆解需求、出选型 BOM、原理图与 PLC ST 代码。
        </Typography>

        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'surfaceContainer',
            p: 1.5,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.05)',
          }}
        >
          <TextField
            multiline
            minRows={3}
            maxRows={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit(value);
              }
            }}
            placeholder="例如：恒温水箱 PLC 控制系统, 需 PLd 安全等级, AC 380V 三相"
            variant="outlined"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '0.875rem',
                bgcolor: 'transparent',
                '& textarea': {
                  resize: 'none',
                },
              },
              '& .MuiOutlinedInput-notchedOutline': {
                border: 'none',
              },
              '& .Mui-focused': {
                outline: 'none',
              },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mt: 1,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'text.disabled',
              }}
            >
              ⌘ + ↵ 提交
            </Typography>
            <Button
              variant="contained"
              disableElevation
              disabled={!value.trim()}
              onClick={() => submit(value)}
              sx={{
                borderRadius: '6px',
                px: 2,
                py: 0.75,
                fontSize: '0.875rem',
                fontWeight: 600,
                minWidth: 0,
                '&.Mui-disabled': {
                  opacity: 0.4,
                  cursor: 'not-allowed',
                },
              }}
            >
              开始设计 →
            </Button>
          </Box>
        </Box>

        {examples.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'text.disabled',
                mb: 1,
              }}
            >
              需要灵感?
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {examples.map((ex) => (
                <Chip
                  key={ex}
                  label={ex}
                  variant="outlined"
                  onClick={() => submit(ex)}
                  sx={{
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                    borderColor: 'divider',
                    '&:hover': {
                      color: 'text.primary',
                      borderColor: 'primary.main',
                      bgcolor: 'surfaceContainer',
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </Box>
  );
}

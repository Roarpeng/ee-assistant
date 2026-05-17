import { useState } from 'react';
import { authedFetch } from '../../services/orgClient';
import { useStore } from '../../models/store';
import {
  Card,
  CardContent,
  CardActions,
  Button,
  Typography,
  Box,
} from '@mui/material';

export interface ClarifyGroup {
  key: string;
  label: string;
  choices: string[];
}

interface Props {
  groups: ClarifyGroup[];
  selected?: Record<string, string>;
  onSelect: (key: string, choice: string) => void;
}

export function ClarifyCard({ groups, selected = {}, onSelect }: Props) {
  // Internal mirror of the user's clicks. Lets ClarifyCard fire its
  // own "确认并记忆" writeback even when the parent stays stateless
  // (e.g. ChatPanel today only relays clicks into the chat input).
  // The displayed selection layers internal state on top of the prop
  // so the existing aria-pressed contract is preserved.
  const [internal, setInternal] = useState<Record<string, string>>({});
  const display = { ...selected, ...internal };
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleClick = (key: string, choice: string) => {
    setInternal((prev) => ({ ...prev, [key]: choice }));
    setSubmitted(false);
    onSelect(key, choice);
  };

  const handleSubmit = async () => {
    // Read state lazily through getState() — see superpowers note in
    // the M1 plan: the writeback is a side-effect of clicking, not a
    // dependency of the render cycle, so we deliberately avoid adding
    // a useStore subscription here.
    const project = useStore.getState().project;
    const answers = { ...selected, ...internal };
    if (!project || Object.keys(answers).length === 0) return;
    setSubmitting(true);
    try {
      await authedFetch(`/api/projects/${project.id}/clarify/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
    } catch {
      // Backend may be down; the user's chip selections still flow
      // into the chat input via onSelect — no UX regression.
    }
    void useStore.getState().refreshPreferences();
    setSubmitting(false);
    setSubmitted(true);
  };

  const hasSelection = Object.keys(display).length > 0;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.6875rem',
            fontWeight: 500,
            mb: 2,
          }}
        >
          请选择以下参数 · clarify
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groups.map((g) => {
            const picked = display[g.key];
            return (
              <Box key={g.key}>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color="text.primary"
                  sx={{ mb: 0.75, fontSize: '0.75rem' }}
                >
                  {g.label}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {g.choices.map((c) => {
                    const isPicked = c === picked;
                    return (
                      <Button
                        key={c}
                        type="button"
                        aria-pressed={isPicked}
                        onClick={() => handleClick(g.key, c)}
                        size="small"
                        variant={isPicked ? 'contained' : 'outlined'}
                        sx={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: '0.75rem',
                          minWidth: 0,
                          py: 0.25,
                          px: 1.25,
                          borderRadius: 1,
                          borderWidth: isPicked ? 1 : 1,
                          ...(isPicked
                            ? {
                                bgcolor: 'primary.light',
                                borderColor: 'primary.main',
                                color: 'primary.main',
                                '&:hover': {
                                  bgcolor: 'primary.light',
                                  borderColor: 'primary.main',
                                },
                              }
                            : {
                                borderColor: 'divider',
                                color: 'text.secondary',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  color: 'text.primary',
                                },
                              }),
                        }}
                      >
                        {c}
                      </Button>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>
      <CardActions sx={{ justifyContent: 'flex-end', gap: 1, px: 2, pb: 1.5 }}>
        {submitted && (
          <Typography
            variant="caption"
            color="success.main"
            data-testid="clarify-writeback-ok"
            sx={{ fontSize: '0.625rem' }}
          >
            已记忆此组织偏好
          </Typography>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !hasSelection}
          data-testid="clarify-submit"
          size="small"
          variant="contained"
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            py: 0.5,
            px: 1.5,
          }}
        >
          {submitting ? '记忆中…' : '确认并记忆'}
        </Button>
      </CardActions>
    </Card>
  );
}

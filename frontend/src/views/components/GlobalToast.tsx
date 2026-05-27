import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useToastStore } from '../../models/toastStore';

export function GlobalToast() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  const current = toasts[0] ?? null;

  return (
    <Snackbar
      open={!!current}
      autoHideDuration={6000}
      onClose={() => current && dismiss(current.id)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {current ? (
        <Alert
          onClose={() => dismiss(current.id)}
          severity={current.severity}
          variant="filled"
          sx={{ width: '100%', maxWidth: 480 }}
        >
          {current.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}

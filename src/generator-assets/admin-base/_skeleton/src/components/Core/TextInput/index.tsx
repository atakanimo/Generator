import { TextField, type TextFieldProps } from '@mui/material';
import { useIsSmallScreen } from '@/hooks';

export default function TextInput(props: TextFieldProps) {
  const { label, type, value, onChange, multiline = false, rows = 1, required = true, fullWidth = true, ...rest } = props;

  const isSmallScreen = useIsSmallScreen();

  return (
    <TextField
      fullWidth={fullWidth}
      label={label}
      type={type}
      value={value}
      onChange={e => onChange?.(e)}
      required={required}
      multiline={multiline}
      rows={rows}
      size={isSmallScreen ? 'small' : 'medium'}
      {...rest}
    />
  );
}

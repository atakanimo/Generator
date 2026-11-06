import { Button, type ButtonProps } from '@mui/material';

type CoreButtonProps = ButtonProps & {
  label: string;
};

export default function CoreButton(props: CoreButtonProps) {
  const { label, sx, ...rest } = props;

  return (
    <Button type='submit' variant='contained' size='large' sx={sx} {...rest}>
      {label}
    </Button>
  );
}

import { type ThemeOptions } from '@mui/material/styles';

export const typography: ThemeOptions['typography'] = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  h1: {
    fontSize: '1.75rem', // 28px mobile
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: '-0.025em',
    '@media (min-width:600px)': {
      fontSize: '2rem' // 32px tablet
    },
    '@media (min-width:960px)': {
      fontSize: '2.25rem' // 36px desktop
    },
    '@media (min-width:1280px)': {
      fontSize: '2.5rem' // 40px large desktop
    }
  },
  h2: {
    fontSize: '1.5rem', // 24px mobile
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.025em',
    '@media (min-width:600px)': {
      fontSize: '1.575rem' // 25.2px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '1.8rem' // 28.8px desktop (-10%)
    },
    '@media (min-width:1280px)': {
      fontSize: '2.025rem' // 32.4px large desktop (-10%)
    }
  },
  h3: {
    fontSize: '1.15rem', // 18px mobile (-10%)
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: '-0.025em',
    '@media (min-width:600px)': {
      fontSize: '1.25rem' // 19.8px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '1.375rem' // 21.6px desktop (-10%)
    },
    '@media (min-width:1280px)': {
      fontSize: '1.6rem' // 25.2px large desktop (-10%)
    }
  },
  h4: {
    fontSize: '1.05rem', // 16.2px mobile (-10%)
    fontWeight: 600,
    lineHeight: 1.4,
    '@media (min-width:600px)': {
      fontSize: '1.1rem' // 17.1px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '1.15rem' // 18px desktop (-10%)
    },
    '@media (min-width:1280px)': {
      fontSize: '1.25rem' // 19.8px large desktop (-10%)
    }
  },
  h5: {
    fontSize: '0.95rem', // 14.4px mobile (-10%)
    fontWeight: 500,
    lineHeight: 1.5,
    '@media (min-width:600px)': {
      fontSize: '1rem' // 15.3px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '1.05rem' // 16.2px desktop (-10%)
    },
    '@media (min-width:1280px)': {
      fontSize: '1.15rem' // 18px large desktop (-10%)
    }
  },
  h6: {
    fontSize: '0.85rem', // 12.6px mobile (-10%)
    fontWeight: 500,
    lineHeight: 1.5,
    '@media (min-width:600px)': {
      fontSize: '0.9rem' // 13.5px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '1rem' // 14.4px desktop (-10%)
    },
    '@media (min-width:1280px)': {
      fontSize: '1.1rem' // 16.2px large desktop (-10%)
    }
  },
  body1: {
    fontSize: '0.8rem', // 12.6px mobile (-10%)
    lineHeight: 1.6,
    '@media (min-width:600px)': {
      fontSize: '0.85rem' // 13.5px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '0.95rem' // 14.4px desktop (-10%)
    }
  },
  body2: {
    fontSize: '0.7rem', // 10.8px mobile (-10%)
    lineHeight: 1.6,
    '@media (min-width:600px)': {
      fontSize: '0.75rem' // 11.7px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '0.8rem' // 12.6px desktop (-10%)
    }
  },
  caption: {
    fontSize: '0.65rem', // 9.9px mobile (-10%)
    lineHeight: 1.5,
    '@media (min-width:600px)': {
      fontSize: '0.68rem' // 10.35px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '0.7rem' // 10.8px desktop (-10%)
    }
  },
  subtitle1: {
    fontSize: '0.8rem', // 12.6px mobile (-10%)
    fontWeight: 500,
    lineHeight: 1.75,
    '@media (min-width:600px)': {
      fontSize: '0.88rem' // 13.5px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '0.95rem' // 14.4px desktop (-10%)
    }
  },
  subtitle2: {
    fontSize: '0.7rem', // 10.8px mobile (-10%)
    fontWeight: 500,
    lineHeight: 1.57,
    '@media (min-width:600px)': {
      fontSize: '0.75rem' // 11.7px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '0.8rem' // 12.6px desktop (-10%)
    }
  },
  button: {
    fontSize: '0.7rem', // 12px mobile
    fontWeight: 500,
    lineHeight: 1.75,
    textTransform: 'uppercase',
    '@media (min-width:600px)': {
      fontSize: '0.85rem' // 13px tablet
    },
    '@media (min-width:960px)': {
      fontSize: '0.865rem' // 14px desktop
    }
  },
  overline: {
    fontSize: '0.615rem', // 10px mobile
    fontWeight: 400,
    lineHeight: 2.66,
    textTransform: 'uppercase',
    '@media (min-width:600px)': {
      fontSize: '0.65rem' // 9.9px tablet (-10%)
    },
    '@media (min-width:960px)': {
      fontSize: '0.7rem' // 10.8px desktop (-10%)
    }
  }
};

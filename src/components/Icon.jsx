// Line icons for the side menu, drawn on a 24 x 24 grid in the current text colour.
const PATHS = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
    list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
    award: 'M12 3a6 6 0 1 0 0 12a6 6 0 1 0 0-12zM8.5 14l-1.5 8 5-3 5 3-1.5-8',
    drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
    box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    clipboard: 'M6 5h12v16H6zM9 3h6v4H9zM9 12h6M9 16h4',
    swap: 'M4 8h15l-4-4M20 16H5l4 4',
    megaphone: 'M3 10v4h3l8 5V5l-8 5H3zM17 9a4 4 0 0 1 0 6',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    chart: 'M4 20V11M10 20V5M16 20v-7M3 20h18',
    check: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 12l3 3 5-6',
    users: 'M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.5 2.6 3.5 6',
    activity: 'M3 12h4l3-8 4 16 3-8h4',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6',
    send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
    user: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
    bell: 'M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16zM10 21h4',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    menu: 'M4 6h16M4 12h16M4 18h16',
    back: 'M19 12H5M11 6l-6 6 6 6',
    close: 'M6 6l12 12M18 6L6 18',
};

export default function Icon({ name, size = 20 }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="icon"
            fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={PATHS[name]} />
        </svg>
    );
}

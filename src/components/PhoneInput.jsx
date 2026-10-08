import { useEffect, useRef } from 'react';
import { normalizePhone, PHONE_RULE } from '../../shared/phone.js';
import { useI18n } from '../i18n.jsx';

export default function PhoneInput({ value, onChange, required = false, ...props }) {
    const { t } = useI18n();
    const input = useRef(null);
    const message = t(PHONE_RULE);

    useEffect(() => {
        input.current.setCustomValidity((required || value.trim()) && !normalizePhone(value) ? message : '');
    }, [value, message, required]);

    function change(event) {
        const next = event.target.value;
        event.target.setCustomValidity((required || next.trim()) && !normalizePhone(next) ? message : '');
        onChange(event);
    }

    return <input {...props} ref={input} required={required} type="tel" inputMode="tel" autoComplete="tel"
        maxLength={30} placeholder="+255 7XX XXX XXX" value={value} onChange={change} title={message} />;
}

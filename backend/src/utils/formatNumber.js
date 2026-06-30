function formatPhoneNumber(number) {
    const digits = String(number).padStart(8, '0').slice(0, 8);
    return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)}`;
}

module.exports = { formatPhoneNumber };
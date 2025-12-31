// src/background/domain_match.js

function normalizeDomain(domain) {
    return domain.toLowerCase().trim().replace(/^\.+/, '');
}

function matchesDomain(hostname, domain) {
    const normalizedDomain = normalizeDomain(domain);
    return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain);
}

function isDomainMatched(hostname, targetDomains) {
    return targetDomains.some(domain => matchesDomain(hostname, domain));
}

export { normalizeDomain, matchesDomain, isDomainMatched };
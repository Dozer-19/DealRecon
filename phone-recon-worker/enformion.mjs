/**
 * Converts a value to a trimmed string.
 * @param {*} value Value to clean.
 * @return {string} Cleaned string.
 */
function clean(value) {
  return String(value || "").trim();
}

function splitOwners(owner) {
  const value = clean(owner)
      .replace(/\s+/g, " ")
      .trim();

  if (!value) return [];

  return value
      .split(/\s+(?:&|AND)\s+/i)
      .map((item) => clean(item))
      .filter(Boolean);
}

/**
 * Splits a deed owner name into first, middle, and last name.
 * @param {string} owner Verified deed owner name.
 * @return {Object} Parsed owner name.
 */
function splitOwnerName(owner) {
  let value = clean(owner);

  // Remove common deed-owner suffixes.
  value = value
      .replace(/\b(JR|SR|II|III|IV)\b\.?/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  // Handle deed format: LAST, FIRST MIDDLE
  if (value.includes(",")) {
    const parts = value.split(",");
    const lastName = clean(parts[0]);
    const remaining = clean(parts.slice(1).join(" "));
    const names = remaining.split(/\s+/).filter(Boolean);

    return {
      firstName: names[0] || "",
      middleName: names.length > 2 ?
        names.slice(1, -1).join(" ") :
        (names[1] || ""),
      lastName: lastName,
    };
  }

  const names = value.split(/\s+/).filter(Boolean);

  if (names.length === 1) {
    return {
      firstName: "",
      middleName: "",
      lastName: names[0],
    };
  }

  if (names.length === 2) {
    return {
      firstName: names[0],
      middleName: "",
      lastName: names[1],
    };
  }

  return {
    firstName: names[0] || "",
    middleName: names.slice(1, -1).join(" "),
    lastName: names[names.length - 1] || "",
  };
}

/**
 * Splits an address into Enformion address lines.
 * @param {string} address Address to split.
 * @return {Object} Enformion-compatible address object.
 */
function splitAddress(address) {
  const value = clean(address)
      .replace(/\s+/g, " ")
      .trim();

  if (!value) {
    return {
      addressLine1: "",
      addressLine2: "",
    };
  }

  // Standard format:
  // 1911 Country Club Dr, Cherry Hill, NJ 08003
  const commaParts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

  if (commaParts.length >= 3) {
    return {
      addressLine1: commaParts[0],
      addressLine2: commaParts.slice(1).join(", "),
    };
  }

  // Deal Recon/public-record format may omit the comma
  // between the street and municipality:
  // 1911 Country Club Dr Cherry Hill, NJ 08003
  //
  // Identify the trailing state/ZIP first, then locate
  // the municipality using common street suffixes.
  const stateZipMatch = value.match(
      /^(.*?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i,
  );

  if (stateZipMatch) {
    const beforeState = clean(stateZipMatch[1]);
    const state = clean(stateZipMatch[2]).toUpperCase();
    const zip = clean(stateZipMatch[3]);

    const streetSuffixes = [
      "STREET", "ST", "ROAD", "RD", "AVENUE", "AVE",
      "DRIVE", "DR", "LANE", "LN", "COURT", "CT",
      "BOULEVARD", "BLVD", "PLACE", "PL", "WAY",
      "TRAIL", "TRL", "TERRACE", "TER", "CIRCLE",
      "CIR", "HIGHWAY", "HWY", "PARKWAY", "PKWY",
    ].join("|");

    const streetCityPattern = new RegExp(
        "^(.*?\\b(?:" + streetSuffixes + "))\\s+(.+)$",
        "i",
    );

    const streetCityMatch = beforeState.match(streetCityPattern);

    if (streetCityMatch) {
      return {
        addressLine1: clean(streetCityMatch[1]),
        addressLine2:
          clean(streetCityMatch[2]) +
          ", " +
          state +
          (zip ? " " + zip : ""),
      };
    }

    return {
      addressLine1: beforeState,
      addressLine2: state + (zip ? " " + zip : ""),
    };
  }

  if (commaParts.length === 2) {
    return {
      addressLine1: commaParts[0],
      addressLine2: commaParts[1],
    };
  }

  return {
    addressLine1: value,
    addressLine2: "",
  };
}

/**
 * Normalizes text for comparison.
 * @param {*} value Value to normalize.
 * @return {string} Normalized value.
 */
function normalize(value) {
  return clean(value)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
}

/**
 * Compares an Enformion address with a requested address.
 * @param {Object} enformionAddress Address returned by Enformion.
 * @param {string} requestedAddress Address supplied by Deal Recon.
 * @return {boolean} True when the addresses match.
 */
function addressMatches(enformionAddress, requestedAddress) {
  const requested = normalize(requestedAddress);

  if (!requested || !enformionAddress) {
    return false;
  }

  const returned = normalize([
    enformionAddress.street,
    enformionAddress.unit,
    enformionAddress.city,
    enformionAddress.state,
    enformionAddress.zip,
  ].filter(Boolean).join(" "));

  if (!returned) {
    return false;
  }

  return returned.includes(requested) ||
    requested.includes(returned);
}

/**
 * Calculates sorting priority for an Enformion phone record.
 * @param {Object} phone Enformion phone record.
 * @return {number} Phone priority score.
 */
function phonePriority(phone) {
  let score = 0;

  const type = clean(phone.type).toLowerCase();

  if (phone.isConnected === true) {
    score += 100;
  }

  if (type === "mobile") {
    score += 50;
  } else if (type === "landline") {
    score += 20;
  }

  const lastReported = Date.parse(phone.lastReportedDate || "");

  if (!Number.isNaN(lastReported)) {
    score += Math.floor(lastReported / 100000000000);
  }

  return score;
}


// This adapter is called only after authentication, allowlisting and quota checks.
export async function enrichContact(lookup, env, fetcher = fetch) {
  const apName = clean(env.ENFORMION_AP_NAME);
  const apPassword = clean(env.ENFORMION_AP_PASSWORD);
  if (!apName || !apPassword) throw new Error('Provider is not configured');
  const {owner, propertyAddress, mailingAddress} = lookup;
  const addresses = [mailingAddress, propertyAddress].filter(Boolean)
      .filter((value, index, list) => list.findIndex(other => normalize(other) === normalize(value)) === index);
  const candidates = [];
  let identityScore = 0;
  // Each owner/address combination can incur a provider charge; cap the work per request.
  for (const deedOwner of splitOwners(owner).slice(0, 2)) {
    const name = splitOwnerName(deedOwner);
    if (!name.firstName || !name.lastName) continue;
    for (const addressText of addresses.slice(0, 2)) {
      const payload = {FirstName: name.firstName, LastName: name.lastName,
        Address: splitAddress(addressText)};
      if (name.middleName) payload.MiddleName = name.middleName;
      const response = await fetcher('https://devapi.enformion.com/Contact/Enrich', {
        method: 'POST', headers: {accept: 'application/json', 'content-type': 'application/json',
          'galaxy-ap-name': apName, 'galaxy-ap-password': apPassword,
          'galaxy-search-type': 'DevAPIContactEnrich'}, body: JSON.stringify(payload),
      });
      // Provider errors must never expose response text or contact data to logs.
      if (!response.ok) throw new Error('Provider request failed');
      const data = await response.json();
      if (data.isError === true) throw new Error('Provider request failed');
      identityScore = Math.max(identityScore, Number(data.identityScore) || 0);
      if (!data.person) continue;
      const person = data.person;
      const phones = Array.isArray(person.phones) ? person.phones.slice().sort((a, b) => phonePriority(b) - phonePriority(a)) : [];
      const emails = Array.isArray(person.emails) ? person.emails : [];
      const returnedAddresses = Array.isArray(person.addresses) ? person.addresses : [];
      const email = emails.find(item => item.isValidated === true) || emails[0];
      const common = {owner: deedOwner, source: 'Enformion Contact Enrichment',
        identityScore: Number(data.identityScore) || 0,
        ownerMatch: normalize(person.name?.firstName) === normalize(name.firstName) &&
          normalize(person.name?.lastName) === normalize(name.lastName),
        mailingMatch: returnedAddresses.some(item => addressMatches(item, mailingAddress)),
        propertyMatch: returnedAddresses.some(item => addressMatches(item, propertyAddress))};
      const matches = phones.filter(phone => clean(phone.number)).slice(0, 10).map((phone, index) => ({
        ...common, phone: clean(phone.number), phoneType: clean(phone.type) || 'Unknown',
        phoneConnected: phone.isConnected === true,
        phoneFirstReported: clean(phone.firstReportedDate), phoneLastReported: clean(phone.lastReportedDate),
        email: index === 0 ? clean(email?.email) : '',
        emailValidated: index === 0 && email?.isValidated === true,
        emailBusiness: index === 0 && email?.isBusiness === true,
      }));
      if (!matches.length && email) matches.push({...common, phone: '', phoneType: 'Unknown',
        phoneConnected: false, phoneFirstReported: '', phoneLastReported: '', email: clean(email.email),
        emailValidated: email.isValidated === true, emailBusiness: email.isBusiness === true});
      candidates.push(...matches);
      if (matches.length) break;
    }
  }
  return {ok: true, provider: 'Enformion Contact Enrichment', identityScore,
    message: candidates.length ? '' : 'No strong matches', candidates};
}

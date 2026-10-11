// Staged WebView client. Not loaded by the installed Android app until the Worker cutover.
export async function securePhoneReconLookup(request, {user, endpoint, fetchImpl = fetch}) {
  if (!user || typeof user.getIdToken !== 'function') throw new Error('Sign in to search contacts.');
  if (!/^https:\/\/[a-z0-9.-]+\/$/i.test(endpoint)) throw new Error('Secure lookup endpoint is unavailable.');
  const token = await user.getIdToken();
  if (!token) throw new Error('Sign in again to search contacts.');
  const response = await fetchImpl(endpoint, {method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify(request)});
  let data;
  try { data = await response.json(); } catch { throw new Error('Contact lookup returned an invalid response.'); }
  if (!response.ok || data?.ok !== true || !Array.isArray(data.candidates))
    throw new Error(data?.error || 'Contact lookup is unavailable.');
  return data.candidates;
}

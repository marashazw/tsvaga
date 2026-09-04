import React from 'react';

// Zimbabwe first (the app's home market and sensible default), then
// Southern African neighbours, then a broad set of other codes - many
// users travel in and out of Zimbabwe and register/log in with a phone
// number from a different country entirely, so the code must be genuinely
// changeable, not just a fixed label.
const COUNTRY_CODES = [["+263", "Zimbabwe"], ["+27", "South Africa"], ["+267", "Botswana"], ["+260", "Zambia"], ["+258", "Mozambique"], ["+265", "Malawi"], ["+266", "Lesotho"], ["+268", "Eswatini"], ["+264", "Namibia"], ["+255", "Tanzania"], ["+254", "Kenya"], ["+256", "Uganda"], ["+250", "Rwanda"], ["+243", "DR Congo"], ["+244", "Angola"], ["+234", "Nigeria"], ["+233", "Ghana"], ["+20", "Egypt"], ["+212", "Morocco"], ["+216", "Tunisia"], ["+44", "United Kingdom"], ["+1", "USA/Canada"], ["+61", "Australia"], ["+64", "New Zealand"], ["+91", "India"], ["+86", "China"], ["+81", "Japan"], ["+82", "South Korea"], ["+65", "Singapore"], ["+971", "UAE"], ["+966", "Saudi Arabia"], ["+974", "Qatar"], ["+49", "Germany"], ["+33", "France"], ["+31", "Netherlands"], ["+351", "Portugal"], ["+34", "Spain"], ["+39", "Italy"], ["+41", "Switzerland"], ["+46", "Sweden"], ["+55", "Brazil"], ["+52", "Mexico"], ["+63", "Philippines"], ["+62", "Indonesia"], ["+880", "Bangladesh"], ["+92", "Pakistan"], ["+7", "Russia"]];

// A dropdown for the country code, paired with a digits-only input for the
// rest of the number. This sidesteps the mobile "sticky prefix" bug from
// an earlier version entirely - selecting from a list has none of the
// select-all-on-focus quirks a pre-filled text field does, while still
// letting anyone pick a different country's code with one tap instead of
// needing to type the whole number including the code themselves.
//
// The parent's value/onChange still deal in the FULL phone string (e.g.
// "+263 771234567"), exactly as before - this component just changes how
// it's edited, not the shape of the data going to the backend.
export default function PhoneInput({ value, onChange, placeholder, required } ) {
  const match = COUNTRY_CODES.find(([code]) => (value || '').startsWith(code + ' ') || value === code);
  const currentCode = match ? match[0] : '+263';
  const digits = (value || '').slice(currentCode.length).replace(/^\s+/, '');

  function handleCodeChange(e) {
    onChange(`${e.target.value} ${digits}`);
  }

  function handleDigitsChange(e) {
    // Drop a leading 0 if someone types the local format out of habit
    // (e.g. "0771234567"), since the country code already covers that.
    const newDigits = e.target.value.replace(/^0+/, '');
    onChange(`${currentCode} ${newDigits}`);
  }

  return (
    <div style={{ display: 'flex' }}>
      <select
        value={currentCode}
        onChange={handleCodeChange}
        style={{
          border: '1px solid #d8cdb9',
          borderRight: 'none',
          borderRadius: '8px 0 0 8px',
          background: '#f2e9dc',
          fontWeight: 600,
          color: 'var(--ink)',
          padding: '0 4px',
          maxWidth: 110,
        }}
      >
        <option value="+263">+263 Zimbabwe</option>
        <option value="+27">+27 South Africa</option>
        <option value="+267">+267 Botswana</option>
        <option value="+260">+260 Zambia</option>
        <option value="+258">+258 Mozambique</option>
        <option value="+265">+265 Malawi</option>
        <option value="+266">+266 Lesotho</option>
        <option value="+268">+268 Eswatini</option>
        <option value="+264">+264 Namibia</option>
        <option value="+255">+255 Tanzania</option>
        <option value="+254">+254 Kenya</option>
        <option value="+256">+256 Uganda</option>
        <option value="+250">+250 Rwanda</option>
        <option value="+243">+243 DR Congo</option>
        <option value="+244">+244 Angola</option>
        <option value="+234">+234 Nigeria</option>
        <option value="+233">+233 Ghana</option>
        <option value="+20">+20 Egypt</option>
        <option value="+212">+212 Morocco</option>
        <option value="+216">+216 Tunisia</option>
        <option value="+44">+44 United Kingdom</option>
        <option value="+1">+1 USA/Canada</option>
        <option value="+61">+61 Australia</option>
        <option value="+64">+64 New Zealand</option>
        <option value="+91">+91 India</option>
        <option value="+86">+86 China</option>
        <option value="+81">+81 Japan</option>
        <option value="+82">+82 South Korea</option>
        <option value="+65">+65 Singapore</option>
        <option value="+971">+971 UAE</option>
        <option value="+966">+966 Saudi Arabia</option>
        <option value="+974">+974 Qatar</option>
        <option value="+49">+49 Germany</option>
        <option value="+33">+33 France</option>
        <option value="+31">+31 Netherlands</option>
        <option value="+351">+351 Portugal</option>
        <option value="+34">+34 Spain</option>
        <option value="+39">+39 Italy</option>
        <option value="+41">+41 Switzerland</option>
        <option value="+46">+46 Sweden</option>
        <option value="+55">+55 Brazil</option>
        <option value="+52">+52 Mexico</option>
        <option value="+63">+63 Philippines</option>
        <option value="+62">+62 Indonesia</option>
        <option value="+880">+880 Bangladesh</option>
        <option value="+92">+92 Pakistan</option>
        <option value="+7">+7 Russia</option>
      </select>
      <input
        type="tel"
        value={digits}
        onChange={handleDigitsChange}
        placeholder={placeholder || '7...'}
        required={required}
        style={{ borderRadius: '0 8px 8px 0', flex: 1, minWidth: 0 }}
      />
    </div>
  );
}

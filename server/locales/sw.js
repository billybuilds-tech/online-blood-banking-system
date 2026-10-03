// Swahili translations of the API's messages and notifications. The English text is the key.
// {placeholders} must appear unchanged in the translation.
export default {
    // System words used inside sentences
    pending: 'inasubiri',
    approved: 'imeidhinishwa',
    completed: 'imekamilika',
    rejected: 'imekataliwa',
    suspended: 'imesimamishwa',
    deferred: 'imeahirishwa',
    normal: 'kawaida',
    urgent: 'haraka',
    critical: 'dharura',
    donor: 'mchangiaji',
    recipient: 'mpokeaji',
    bloodbank: 'benki ya damu',

    // General and security
    'Invalid id': 'Kitambulisho si sahihi',
    'Endpoint not found': 'Huduma iliyoombwa haipo',
    'Invalid JSON body': 'Data iliyotumwa si sahihi',
    'This record already exists': 'Rekodi hii tayari ipo',
    'The change would make stock negative': 'Mabadiliko haya yangefanya akiba ishuke chini ya sifuri',
    'Something went wrong on the server': 'Hitilafu imetokea kwenye seva',
    'Login required': 'Tafadhali ingia kwanza',
    'Invalid or expired session. Please log in again.': 'Muda wa kuingia umekwisha au si sahihi. Tafadhali ingia tena.',
    'This account is not active': 'Akaunti hii haiko hai',
    'You do not have permission for this action': 'Huna ruhusa ya kufanya kitendo hiki',
    'Units must be a whole number from 1 to {max}': 'Uniti ziwe namba kamili kuanzia 1 hadi {max}',
    'Password must be at least 8 characters and contain both letters and numbers':
        'Nenosiri liwe na angalau herufi 8 na liwe na herufi pamoja na namba',

    // Registration, login and profile
    'Role must be donor, recipient or bloodbank': 'Aina ya akaunti iwe mchangiaji, mpokeaji au benki ya damu',
    'Name is required': 'Jina linahitajika',
    'A valid email address is required': 'Barua pepe sahihi inahitajika',
    'Invalid blood type': 'Kundi la damu si sahihi',
    'Blood type is required for donors': 'Wachangiaji wanapaswa kuweka kundi la damu',
    'A valid date of birth is required for donors': 'Wachangiaji wanapaswa kuweka tarehe sahihi ya kuzaliwa',
    'Region is required for blood banks': 'Benki za damu zinapaswa kuweka mkoa',
    'An account with this email already exists': 'Tayari kuna akaunti yenye barua pepe hii',
    'Blood bank awaiting approval': 'Benki ya damu inasubiri idhini',
    '{name} registered as a blood bank and is waiting for your approval.':
        '{name} imejisajili kama benki ya damu na inasubiri idhini yako.',
    'New user registered': 'Mtumiaji mpya amejisajili',
    '{name} registered as a donor.': '{name} amejisajili kama mchangiaji damu.',
    '{name} registered as a recipient.': '{name} amejisajili kama mpokeaji damu.',
    'Registration received. The Blood Bank Manager must approve this blood bank before you can log in.':
        'Usajili umepokelewa. Meneja wa Benki ya Damu anapaswa kuidhinisha benki hii kabla hujaweza kuingia.',
    'Account created. You can now log in.': 'Akaunti imeundwa. Sasa unaweza kuingia.',
    'Email and password are required': 'Barua pepe na nenosiri vinahitajika',
    'Invalid email or password': 'Barua pepe au nenosiri si sahihi',
    'Your account is waiting for approval by the Blood Bank Manager': 'Akaunti yako inasubiri idhini ya Meneja wa Benki ya Damu',
    'Your registration was rejected. Contact the Blood Bank Manager.': 'Usajili wako ulikataliwa. Wasiliana na Meneja wa Benki ya Damu.',
    'Your account has been suspended. Contact the Blood Bank Manager.': 'Akaunti yako imesimamishwa. Wasiliana na Meneja wa Benki ya Damu.',
    'Name cannot be empty': 'Jina haliwezi kuwa tupu',
    'Blood type is confirmed by the blood bank after a donation and cannot be changed':
        'Kundi la damu limethibitishwa na benki ya damu baada ya mchango na haliwezi kubadilishwa',
    'Invalid date of birth': 'Tarehe ya kuzaliwa si sahihi',
    'Current password is incorrect': 'Nenosiri la sasa si sahihi',
    'Password changed': 'Nenosiri limebadilishwa',
    'Profile updated': 'Wasifu umesasishwa',

    // Users (Blood Bank Manager)
    'Invalid role': 'Aina ya akaunti si sahihi',
    'Invalid status': 'Hali si sahihi',
    'You do not have permission to list these users': 'Huna ruhusa ya kuona watumiaji hawa',
    'Status must be pending, approved, rejected or suspended': 'Hali iwe inasubiri, imeidhinishwa, imekataliwa au imesimamishwa',
    'You cannot change the status of your own account': 'Huwezi kubadilisha hali ya akaunti yako mwenyewe',
    'User not found': 'Mtumiaji hakupatikana',
    'Account approved': 'Akaunti imeidhinishwa',
    'Your account has been approved. You can now use the system.': 'Akaunti yako imeidhinishwa. Sasa unaweza kutumia mfumo.',
    'Account rejected': 'Akaunti imekataliwa',
    'Your registration was not approved. Contact the Blood Bank Manager for details.':
        'Usajili wako haukuidhinishwa. Wasiliana na Meneja wa Benki ya Damu kwa maelezo zaidi.',
    'Account suspended': 'Akaunti imesimamishwa',
    'Your account has been suspended by the Blood Bank Manager.': 'Akaunti yako imesimamishwa na Meneja wa Benki ya Damu.',
    'Account pending': 'Akaunti inasubiri ukaguzi',
    'Your account has been set back to pending review.': 'Akaunti yako imerudishwa kwenye hali ya kusubiri ukaguzi.',
    '{name}: {status}': '{name}: {status}',
    'You cannot delete your own account': 'Huwezi kufuta akaunti yako mwenyewe',
    'User deleted': 'Mtumiaji amefutwa',

    // Stock
    'Units must be a whole number from 1 to 500': 'Uniti ziwe namba kamili kuanzia 1 hadi 500',
    'Units must be a whole number of 0 or more': 'Uniti ziwe namba kamili ya 0 au zaidi',
    '{units} unit(s) of {bloodType} added': 'Uniti {units} za {bloodType} zimeongezwa',
    '{bloodType} stock set to {units} unit(s)': 'Akiba ya {bloodType} imewekwa kuwa uniti {units}',
    'Not enough {bloodType} in stock ({available} available, {units} needed)':
        'Hakuna {bloodType} ya kutosha kwenye akiba (zipo {available}, zinahitajika {units})',
    'Low stock: {bloodType}': 'Akiba ndogo: {bloodType}',
    'Only {units} unit(s) of {bloodType} remain. The alert level is {threshold} units.':
        'Zimebaki uniti {units} tu za {bloodType}. Kiwango cha tahadhari ni uniti {threshold}.',

    // Appointments and donations
    'Date of birth is required to check eligibility': 'Tarehe ya kuzaliwa inahitajika ili kukagua kama unastahili',
    'Donors must be at least {min} years old': 'Mchangiaji anapaswa kuwa na umri wa angalau miaka {min}',
    'Donors must not be older than {max} years': 'Mchangiaji hapaswi kuzidi umri wa miaka {max}',
    'At least {days} days must pass between donations. You may book from {date}.':
        'Lazima zipite angalau siku {days} kati ya michango. Unaweza kupanga miadi kuanzia {date}.',
    'Choose a valid appointment date': 'Chagua tarehe sahihi ya miadi',
    'The appointment date cannot be in the past': 'Tarehe ya miadi haiwezi kuwa iliyokwisha pita',
    'Choose an approved blood bank': 'Chagua benki ya damu iliyoidhinishwa',
    'Add your blood type to your profile before booking': 'Weka kundi lako la damu kwenye wasifu kabla ya kupanga miadi',
    'You already have an open appointment. Wait until it is completed or rejected.':
        'Tayari una miadi iliyo wazi. Subiri hadi ikamilike au ikataliwe.',
    'New donation booking': 'Miadi mpya ya kuchangia damu',
    '{name} ({bloodType}) booked a donation for {date}.': '{name} ({bloodType}) amepanga kuchangia damu tarehe {date}.',
    'Appointment booked at {bank} for {date}': 'Miadi imepangwa katika {bank} tarehe {date}',
    'Enter the collected volume in whole millilitres (mL)': 'Andika ujazo uliokusanywa kwa mililita kamili (mL)',
    'Volumes above {max} mL are outside the accepted range for a {bag} mL bag. Check the measurement.':
        'Ujazo wa zaidi ya mL {max} uko nje ya kiwango kinachokubalika kwa mfuko wa mL {bag}. Hakiki kipimo.',
    'Appointment not found': 'Miadi haikupatikana',
    'This appointment belongs to another blood bank': 'Miadi hii ni ya benki nyingine ya damu',
    'An appointment cannot move from {from} to {to}': 'Miadi haiwezi kubadilika kutoka "{from}" kwenda "{to}"',
    'Donation verified': 'Mchango umethibitishwa',
    'Thank you! Your donation at {bank} was verified. Your certificate is ready to download.':
        'Asante! Mchango wako katika {bank} umethibitishwa. Cheti chako kiko tayari kupakuliwa.',
    'Collection incomplete': 'Ukusanyaji haukukamilika',
    'Thank you for coming to {bank}. Only {volume} mL could be collected, which is not enough for a usable unit, so it was not recorded as a donation. You may book again.':
        'Asante kwa kufika {bank}. Ni mL {volume} tu zilizoweza kukusanywa, ambazo hazitoshi kuwa uniti inayotumika, kwa hiyo hazikurekodiwa kama mchango. Unaweza kupanga miadi tena.',
    'Appointment approved': 'Miadi imeidhinishwa',
    'Your donation appointment on {date} at {bank} was approved.': 'Miadi yako ya kuchangia damu tarehe {date} katika {bank} imeidhinishwa.',
    'Appointment rejected': 'Miadi imekataliwa',
    'Your donation appointment on {date} was not accepted. Reason: {reason}':
        'Miadi yako ya kuchangia damu tarehe {date} haikukubaliwa. Sababu: {reason}',
    'Your donation appointment on {date} was not accepted.': 'Miadi yako ya kuchangia damu tarehe {date} haikukubaliwa.',
    'Standard unit ({volume} mL) verified and added to stock': 'Uniti kamili (mL {volume}) imethibitishwa na kuongezwa kwenye akiba',
    'Low-volume unit ({volume} mL) added to stock — use for red cells only':
        'Uniti ya ujazo mdogo (mL {volume}) imeongezwa kwenye akiba — itumike kwa chembe nyekundu tu',
    'Incomplete collection ({volume} mL) — not added to stock': 'Ukusanyaji haukukamilika (mL {volume}) — haukuongezwa kwenye akiba',

    // Health screening (questionnaire, donation-day check, deferral, blood group confirmation)
    'Are you feeling healthy and well today?': 'Je, unajisikia mzima na mwenye afya leo?',
    'Please book when you are feeling well.': 'Tafadhali panga miadi utakapojisikia vizuri.',
    'Do you weigh at least {minWeight} kg?': 'Je, una uzito wa angalau kilo {minWeight}?',
    'Donors must weigh at least {minWeight} kg.': 'Mchangiaji anapaswa kuwa na uzito wa angalau kilo {minWeight}.',
    'In the last 2 weeks, have you had a fever, malaria or any other infection?':
        'Katika wiki 2 zilizopita, umewahi kuwa na homa, malaria au maambukizi mengine yoyote?',
    'Please book once you have been fully well for at least 2 weeks.': 'Tafadhali panga miadi baada ya kuwa mzima kabisa kwa angalau wiki 2.',
    'Are you taking antibiotics or other medicine prescribed by a doctor?': 'Je, unatumia antibiotiki au dawa nyingine ulizoandikiwa na daktari?',
    'Please finish your treatment first; the blood bank can tell you when you may donate.':
        'Tafadhali maliza matibabu yako kwanza; benki ya damu itakueleza lini unaweza kuchangia.',
    'Are you pregnant, or have you given birth in the last 6 months? (Answer No if this does not apply.)':
        'Je, una ujauzito, au umejifungua katika miezi 6 iliyopita? (Jibu Hapana kama haikuhusu.)',
    'Please book again at least 6 months after giving birth.': 'Tafadhali panga miadi tena angalau miezi 6 baada ya kujifungua.',
    'In the last 6 months, have you had surgery, a tattoo, a piercing or a blood transfusion?':
        'Katika miezi 6 iliyopita, umefanyiwa upasuaji, kuchorwa tattoo, kutobolewa mwili au kuongezewa damu?',
    'Please book again 6 months after the procedure.': 'Tafadhali panga miadi tena miezi 6 baada ya tukio hilo.',
    'Low haemoglobin': 'Kiwango kidogo cha damu (Hb)',
    'Weight below the minimum': 'Uzito chini ya kiwango',
    'Blood pressure outside the safe range': 'Presha nje ya kiwango salama',
    'Pulse outside the safe range': 'Mapigo ya moyo nje ya kiwango salama',
    'Raised temperature': 'Joto la mwili liko juu',
    'Recent illness': 'Ugonjwa wa karibuni',
    'Current medication': 'Dawa anazotumia sasa',
    'Medical reason (the blood bank will explain in person)': 'Sababu ya kiafya (benki ya damu itakueleza ana kwa ana)',
    'Weight (kg)': 'Uzito (kg)',
    'Haemoglobin (g/dL)': 'Hemoglobini (g/dL)',
    'Blood pressure, systolic (mmHg)': 'Presha ya juu (mmHg)',
    'Blood pressure, diastolic (mmHg)': 'Presha ya chini (mmHg)',
    'Pulse (beats per minute)': 'Mapigo ya moyo (kwa dakika)',
    'Temperature (°C)': 'Joto (°C)',
    'You are not able to donate blood at present. Please talk to the blood bank for advice.':
        'Kwa sasa huwezi kuchangia damu. Tafadhali zungumza na benki ya damu kwa ushauri.',
    'After your last health check you may donate again from {date}.':
        'Kulingana na uchunguzi wako wa mwisho wa afya, unaweza kuchangia tena kuanzia {date}.',
    'Please answer all the health questions': 'Tafadhali jibu maswali yote ya afya',
    'Based on your answers you should not donate at this time.': 'Kulingana na majibu yako, hupaswi kuchangia damu kwa sasa.',
    'Record the health check before collecting blood': 'Rekodi uchunguzi wa afya kabla ya kukusanya damu',
    'Enter a valid value for {field}': 'Andika thamani sahihi ya {field}',
    'Choose a reason for the deferral': 'Chagua sababu ya kuahirisha',
    'Enter how many days the deferral lasts (1 to 3650)': 'Andika idadi ya siku za kuahirisha (1 hadi 3650)',
    'Donation deferred': 'Uchangiaji umeahirishwa',
    'After the health check at {bank} you are not able to donate blood at present. Reason: {reason}. Please talk to the blood bank for advice.':
        'Baada ya uchunguzi wa afya katika {bank}, kwa sasa huwezi kuchangia damu. Sababu: {reason}. Tafadhali zungumza na benki ya damu kwa ushauri.',
    'After the health check at {bank} please wait before donating again. Reason: {reason}. You may donate again from {until}.':
        'Baada ya uchunguzi wa afya katika {bank}, tafadhali subiri kabla ya kuchangia tena. Sababu: {reason}. Unaweza kuchangia tena kuanzia {until}.',
    'The health check did not pass ({checks}). Defer the donor instead of collecting blood.':
        'Uchunguzi wa afya haukufaulu ({checks}). Ahirisha mchangiaji badala ya kukusanya damu.',
    'Choose the blood group confirmed by the grouping test': 'Chagua kundi la damu lililothibitishwa na kipimo cha kundi',
    'Blood group corrected': 'Kundi la damu limesahihishwa',
    'The grouping test at {bank} shows your blood group is {newType} (you had entered {oldType}). Your profile has been updated.':
        'Kipimo cha kundi la damu katika {bank} kinaonyesha kundi lako ni {newType} (uliandika {oldType}). Wasifu wako umesasishwa.',
    'Blood group confirmed': 'Kundi la damu limethibitishwa',
    'The grouping test at {bank} confirmed your blood group as {newType}.': 'Kipimo cha kundi la damu katika {bank} kimethibitisha kundi lako ni {newType}.',
    'Donor deferred until {date}': 'Mchangiaji ameahirishwa hadi {date}',
    'Donor deferred permanently': 'Mchangiaji ameahirishwa kwa kudumu',

    // Blood requests
    'Choose a valid blood type': 'Chagua kundi sahihi la damu',
    'Urgency must be normal, urgent or critical': 'Uharaka uwe wa kawaida, haraka au dharura',
    'New blood request': 'Ombi jipya la damu',
    'URGENT blood request': 'Ombi la damu la HARAKA',
    'CRITICAL blood request': 'Ombi la damu la DHARURA',
    '{name} requested {units} unit(s) of {bloodType}.': '{name} ameomba uniti {units} za {bloodType}.',
    '{name} (blood donor, {count} donation(s)) requested {units} unit(s) of {bloodType}.':
        '{name} (mchangiaji damu, michango {count}) ameomba uniti {units} za {bloodType}.',
    'Request sent to {bank}': 'Ombi limetumwa kwa {bank}',
    'Status must be approved or rejected': 'Hali iwe imeidhinishwa au imekataliwa',
    'Request not found': 'Ombi halikupatikana',
    'This request was sent to another blood bank': 'Ombi hili lilitumwa kwa benki nyingine ya damu',
    'This request is already {status}': 'Ombi hili tayari lina hali: {status}',
    '{bank} approved your request for {units} unit(s) of {bloodType}. Please contact the bank to arrange collection.':
        '{bank} imeidhinisha ombi lako la uniti {units} za {bloodType}. Tafadhali wasiliana na benki kupanga uchukuaji.',
    '{bank} could not approve your request for {units} unit(s) of {bloodType}. Reason: {reason}':
        '{bank} haikuweza kuidhinisha ombi lako la uniti {units} za {bloodType}. Sababu: {reason}',
    '{bank} could not approve your request for {units} unit(s) of {bloodType}.':
        '{bank} haikuweza kuidhinisha ombi lako la uniti {units} za {bloodType}.',
    'Blood request approved': 'Ombi la damu limeidhinishwa',
    'Blood request rejected': 'Ombi la damu limekataliwa',
    'Request approved': 'Ombi limeidhinishwa',
    'Request rejected': 'Ombi limekataliwa',

    // Inter-bank requests
    'Choose another blood bank': 'Chagua benki nyingine ya damu',
    'Inter-bank blood request': 'Ombi la damu kutoka benki nyingine',
    'URGENT inter-bank request': 'Ombi la HARAKA kutoka benki nyingine',
    'CRITICAL inter-bank request': 'Ombi la DHARURA kutoka benki nyingine',
    '{name} asked for {units} unit(s) of {bloodType}.': '{name} imeomba uniti {units} za {bloodType}.',
    'Only the bank asked to supply the blood can respond': 'Ni benki iliyoombwa damu pekee inayoweza kujibu ombi hili',
    '{bank} transferred {units} unit(s) of {bloodType} to your stock.': '{bank} imehamisha uniti {units} za {bloodType} kwenye akiba yako.',
    '{bank} declined your request for {units} unit(s) of {bloodType}. Reason: {reason}':
        '{bank} imekataa ombi lako la uniti {units} za {bloodType}. Sababu: {reason}',
    '{bank} declined your request for {units} unit(s) of {bloodType}.': '{bank} imekataa ombi lako la uniti {units} za {bloodType}.',
    'Inter-bank request approved': 'Ombi kati ya benki limeidhinishwa',
    'Inter-bank request rejected': 'Ombi kati ya benki limekataliwa',

    // Notifications and reports
    'Notification not found': 'Arifa haikupatikana',
    'All notifications marked as read': 'Arifa zote zimewekwa kuwa zimesomwa',
    'Notification marked as read': 'Arifa imewekwa kuwa imesomwa',
    'Title and message are required': 'Kichwa na ujumbe vinahitajika',
    'Invalid delivery method': 'Njia ya kutuma si sahihi',
    'Choose at least one user': 'Chagua angalau mtumiaji mmoja',
    'Target must be all, role or users': 'Walengwa wawe wote, kundi au watumiaji maalum',
    'No users match this target': 'Hakuna watumiaji wanaolingana na walengwa hawa',
    'Notification sent to {count} user(s)': 'Arifa imetumwa kwa watumiaji {count}',
    'Month must be in YYYY-MM format': 'Mwezi uwe katika muundo YYYY-MM',
};

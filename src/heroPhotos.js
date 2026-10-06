/*
 * Photos behind the heading of the home page, shown one after another. They are openly licensed
 * photos of blood donation in Africa from Wikimedia Commons; their authors and licences are shown
 * on the page as the licences require.
 *
 * To use photos from Tanzania (for example taken at your own blood drive, with the consent of the
 * people in them, or photos the National Blood Transfusion Service permits you to use), put the
 * files in public/images/hero/ and list them here with their credit. `position` chooses which part
 * of the photo stays in view when it is cropped.
 */
export const HERO_PHOTOS = [
    {
        src: '/images/hero/donation-arm.jpg',
        position: 'center 45%',
        credit: 'AMISOM Public Information',
        license: 'CC0',
        source: 'https://commons.wikimedia.org/wiki/File:A_police_officer_serving_under_the_African_Union_Mission_in_Somalia_donates_blood_at_the_AMISOM_Force_Headquarters.jpg',
    },
    {
        src: '/images/hero/campus-drive.jpg',
        position: 'center 28%',
        credit: 'JacobOcenFay',
        license: 'CC BY-SA 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Blood_donation_at_Mbarara_University,_Uganda.jpg',
    },
    {
        src: '/images/hero/screening.jpg',
        position: 'center 40%',
        credit: 'Pambelle12',
        license: 'CC BY-SA 4.0',
        source: 'https://commons.wikimedia.org/wiki/File:Health_worker_draws_blood.jpg',
    },
];

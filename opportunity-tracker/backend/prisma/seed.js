require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const societies = [
    { name: 'Aerospace and Electronic Systems', web: 'https://ieee-aess.org' },
    { name: 'Antennas and Propagation', web: 'https://ieeeaps.org' },
    { name: 'Broadcast Technology', web: 'https://ieee-bts.org' },
    { name: 'Circuits and Systems', web: 'https://ieee-cas.org' },
    { name: 'Communications', web: 'https://comsoc.org' },
    { name: 'Computational Intelligence', web: 'https://ieee-cis.org' },
    { name: 'Computer', web: 'https://computer.org' },
    { name: 'Consumer Technology', web: 'https://ctsoc.ieee.org/' },
    { name: 'Control Systems', web: 'https://ieeecss.org' },
    { name: 'Dielectrics and Electrical Insulation', web: 'https://deis.org/' },
    { name: 'Education', web: 'https://ieee-edusociety.org' },
    { name: 'Electromagnetic Compatibility', web: 'https://ieeeemc.org' },
    { name: 'Electron Devices', web: 'https://ieee-eds.org' },
    { name: 'Electronics Packaging', web: 'https://eps.ieee.org/' },
    { name: 'Engineering in Medicine and Biology', web: 'https://embs.org' },
    { name: 'Geoscience and Remote Sensing', web: 'https://grss-ieee.org' },
    { name: 'Industrial Electronics', web: 'https://ieee-ies.org' },
    { name: 'Industry Applications', web: 'https://ias.ieee.org/' },
    { name: 'Information Theory', web: 'https://itsoc.org' },
    { name: 'Instrumentation and Measurement', web: 'https://ieee-ims.org' },
    { name: 'Intelligent Transportation Systems', web: 'https://ieee-itss.org' },
    { name: 'Magnetics', web: 'https://ieeemagnetics.org/' },
    { name: 'Microwave Theory and Technology', web: 'https://mtt.org' },
    { name: 'Nuclear and Plasma Sciences', web: 'https://ieee-npss.org' },
    { name: 'Oceanic Engineering', web: 'https://ieeeoes.org/' },
    { name: 'Photonics', web: 'https://www.photonicssociety.org/' },
    { name: 'Power Electronics', web: 'https://ieee-pels.org' },
    { name: 'Power & Energy', web: 'https://ieee-pes.org' },
    { name: 'Product Safety Engineering', web: 'https://pses.ieee.org' },
    { name: 'Professional Communication', web: 'https://procomm.ieee.org/' },
    { name: 'Reliability', web: 'https://rs.ieee.org' },
    { name: 'Robotics and Automation', web: 'https://ieee-ras.org' },
    { name: 'Signal Processing', web: 'https://signalprocessingsociety.org' },
    { name: 'Society on Social Implications of Technology', web: 'https://ieee-ssit.org' },
    { name: 'Solid-State Circuits', web: 'https://sscs.ieee.org' },
    { name: 'Systems, Man, and Cybernetics', web: 'https://ieeesmc.org' },
    { name: 'Technology and Engineering Management', web: 'https://tems.ieee.org' },
    { name: 'Ultrasonics, Ferroelectrics, and Frequency Control', web: 'https://ieee-uffc.org' },
    { name: 'Vehicular Technology', web: 'https://vtsociety.org' }
];

const councils = [
    { name: 'Biometrics Council', web: 'https://ieee-biometrics.org' },
    { name: 'Council on Electronic Design Automation (CEDA)', web: 'https://ieee-ceda.org' },
    { name: 'Nanotechnology Council', web: 'https://ieee-nano.org' },
    { name: 'Council on RFID (CRFID)', web: 'https://ieee-rfid.org/' },
    { name: 'Sensors Council', web: 'https://ieee-sensors.org' },
    { name: 'Council on Superconductivity', web: 'https://ieeecsc.org' },
    { name: 'Systems Council', web: 'https://ieeesystemscouncil.org' },
    { name: 'Future Networks', web: 'https://futurenetworks.ieee.org' }
];

async function main() {
    console.log('Seeding organizations...');

    for (const soc of societies) {
        await prisma.organization.create({
            data: {
                name: soc.name,
                type: 'society',
                officialWebsite: soc.web,
            }
        });
    }

    for (const council of councils) {
        await prisma.organization.create({
            data: {
                name: council.name,
                type: 'council',
                officialWebsite: council.web,
            }
        });
    }

    // Create Global IEEE Competitions entry
    await prisma.organization.create({
        data: {
            name: 'IEEE Global Student Competitions',
            type: 'society', // Treat as abstract organization
            officialWebsite: 'https://www.ieee.org/membership/students/competitions.html',
        }
    });

    console.log('Organizations seeded. Creating logic...');

    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.adminUser.create({
        data: {
            username: 'admin',
            passwordHash
        }
    });

    console.log('Admin user seeded (admin / admin123).');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

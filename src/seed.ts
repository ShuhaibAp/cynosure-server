import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserSchema } from './common/users/schemas/user.schema.js';
import { Role } from './common/enums/role.enum.js';

process.loadEnvFile();

const TEST_USERS: Array<{
  name: string;
  email: string;
  password: string;
  roles: Role[];
}> = [
  {
    name: 'Rahul Sharma',
    email: 'bd@echotrace.com',
    password: 'EchoBD#4271',
    roles: [Role.BdTeam],
  },
  {
    name: 'Priya Nair',
    email: 'admin@echotrace.com',
    password: 'EchoAdm#5938',
    roles: [Role.Admin],
  },
  {
    name: 'Aisha Khan',
    email: 'ops@echotrace.com',
    password: 'EchoOps#6184',
    roles: [Role.Operations],
  },
  {
    name: 'Suresh Iyer',
    email: 'factory@echotrace.com',
    password: 'EchoFac#7352',
    roles: [Role.Factory],
  },
  // Demonstrates a single account holding more than one role - the login page's role
  // selector picks which one is active for the session.
  {
    name: 'Karan Mehta',
    email: 'bd-ops@echotrace.com',
    password: 'EchoBO#8465',
    roles: [Role.BdTeam, Role.Operations],
  },
];

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  const UserModel = mongoose.model(User.name, UserSchema);

  // Remove the previous login accounts before seeding the new ones.
  await UserModel.deleteMany({
    email: {
      $in: [
        'bd@cynosure.example.com',
        'admin@cynosure.example.com',
        'ops@cynosure.example.com',
        'factory@cynosure.example.com',
        'bd-ops@cynosure.example.com',
      ],
    },
  });

  for (const u of TEST_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await UserModel.updateOne(
      { email: u.email },
      {
        $set: {
          name: u.name,
          email: u.email,
          passwordHash,
          roles: u.roles,
          active: true,
        },
        // Clears the old single `role` field left over from before multi-role accounts.
        $unset: { role: '' },
      },
      { upsert: true },
    );
    console.log(`Seeded ${u.roles.join(' + ')}: ${u.email} / ${u.password}`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => {
    console.log('Seeding complete.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../enums/role.enum.js';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({ type: String, required: true })
  passwordHash!: string;

  // One account can hold more than one role (e.g. the same person acts as both BD Team and
  // Operations Team) - the role selector on the login page picks which one is active for that
  // session, validated against this list. Must never be empty.
  @Prop({
    type: [String],
    required: true,
    enum: Role,
    validate: {
      validator: (v: Role[]) => Array.isArray(v) && v.length > 0,
      message: 'A user must have at least one role',
    },
  })
  roles!: Role[];

  @Prop({ type: Boolean, default: true })
  active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

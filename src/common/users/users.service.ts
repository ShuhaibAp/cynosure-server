import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema.js';
import { Role } from '../enums/role.enum.js';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findById(id: string) {
    if (!isValidObjectId(id)) return Promise.resolve(null);
    return this.userModel.findById(id).exec();
  }

  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    roles: Role[];
    active?: boolean;
  }) {
    return this.userModel.create(data);
  }

  setPasswordHash(id: string, passwordHash: string) {
    return this.userModel
      .findByIdAndUpdate(id, { $set: { passwordHash } })
      .exec();
  }

  /** Every account, newest first (a few dozen at most). */
  list() {
    return this.userModel.find().sort({ createdAt: -1 }).limit(500).exec();
  }

  update(
    id: string,
    changes: { name?: string; roles?: Role[]; active?: boolean },
  ) {
    return this.userModel
      .findByIdAndUpdate(id, { $set: changes }, { returnDocument: 'after' })
      .exec();
  }

  /** Active accounts that can act as Admin, optionally ignoring one (the one being changed). */
  countActiveAdmins(excludingId?: string) {
    return this.userModel
      .countDocuments({
        active: true,
        roles: Role.Admin,
        ...(excludingId ? { _id: { $ne: excludingId } } : {}),
      })
      .exec();
  }
}

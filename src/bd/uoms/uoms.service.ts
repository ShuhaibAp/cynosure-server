import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Uom } from '../../common/enums/inspection.enum.js';
import { UomOption, UomOptionDocument } from './schemas/uom-option.schema.js';

@Injectable()
export class UomsService {
  constructor(
    @InjectModel(UomOption.name) private model: Model<UomOptionDocument>,
  ) {}

  /** Built-in units first, then the ones BD added, oldest first. */
  async list(): Promise<string[]> {
    const custom = await this.model.find().sort({ createdAt: 1 }).exec();
    return [...Object.values(Uom), ...custom.map((u) => u.name)];
  }

  /** Adds a unit; a name that already exists (any casing) is returned as is. */
  async add(name: string, userId: string) {
    const existing = (await this.list()).find(
      (u) => u.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return { name: existing };
    try {
      await this.model.create({
        name,
        key: name.toLowerCase(),
        createdBy: new Types.ObjectId(userId),
      });
    } catch (err) {
      // Two people adding the same name at once: the unique key makes one lose.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    return { name };
  }

  /** Maps each value to its known spelling (any casing), or null when it isn't a known unit. */
  async resolve(
    values: Array<string | undefined>,
  ): Promise<Array<string | null>> {
    const known = await this.list();
    return values.map(
      (v) => known.find((u) => u.toLowerCase() === v?.toLowerCase()) ?? null,
    );
  }
}

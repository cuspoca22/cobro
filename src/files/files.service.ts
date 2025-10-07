import { join } from 'path';
import { existsSync } from 'fs';
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FilesService {

  constructor(
    private readonly configService: ConfigService
  ) { }

  getStaticProductsImage(imageName: string, collection: string) {
    const path = join(__dirname, `../../static/${collection}`, imageName);
    if (!existsSync(path))
      throw new BadRequestException('No product found image' + imageName)

    return path;
  }

}

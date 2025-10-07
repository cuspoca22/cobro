import { Controller, Get, Post, Param, UploadedFile, UseInterceptors, BadRequestException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { Response } from 'express';
import { fileFilter, fileNamer } from './helpers';
import { diskStorage } from 'multer';
import { DynamicDestinationInterceptor } from '../common/interceptors/dynamic-destination.interceptor';
import { Auth } from 'src/auth/decorators';

@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private configService: ConfigService,
  ) {}

  @Get(':collection/:imageName')
  findProductImage(
    @Res() res: Response,
    @Param('imageName') imageName: string,
    @Param('collection') collection: string
  ){
    const path = this.filesService.getStaticProductsImage(imageName, collection);
    res.sendFile(path)
  }

  @Auth()
  @Post(':collection')
  @UseInterceptors(
    DynamicDestinationInterceptor,
    FileInterceptor('file',{
      fileFilter: fileFilter,
      storage: diskStorage({
        destination: (req, file, cb) => {
          const collection = req['collection'];
          const destination = `./static/${collection}`;
          cb(null, destination);
        },
        filename: fileNamer,
      })
    }))
  uploadProductImage(
    @UploadedFile()
    file: Express.Multer.File,

    @Param('collection') collection: string
  ){

    if(!file){
      throw new BadRequestException('Por favor seleccion un archivo validos')
    }

    const secureUrl = `${this.configService.get('HOST_API')}/files/${collection}/${file.filename}`;

    return { secureUrl }
  }

}

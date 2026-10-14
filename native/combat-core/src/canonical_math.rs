// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
// Browser/Electron canonical atan2 translated from LLVM libc atan2.h, atan_utils.h, double_double.h.
// Sources: https://github.com/llvm/llvm-project/tree/main/libc/src/__support/math
// and https://github.com/llvm/llvm-project/blob/main/libc/src/__support/FPUtil/double_double.h.
// Copyright LLVM Project contributors. Apache-2.0 WITH LLVM-exception.
// V8 15.1 src/base/ieee754.cc uses this shared implementation.
// No rule/tie tolerance: callers preserve original source arithmetic and roster ordering.
#[derive(Clone,Copy)]struct DD{lo:f64,hi:f64}
fn sum(a:f64,b:f64)->DD{let hi=a+b;DD{hi,lo:b-(hi-a)}}
fn add(a:DD,b:DD)->DD{let r=sum(a.hi,b.hi);let lo=a.lo+b.lo;sum(r.hi,r.lo+lo)}
fn split(a:f64)->DD{let t1=134217729.0*a;let t2=a-t1;let hi=t1+t2;DD{hi,lo:a-hi}}
fn mul(a:f64,b:f64)->DD{let aa=split(a);let bb=split(b);let hi=a*b;let t1=aa.hi*bb.hi-hi;let t2=aa.hi*bb.lo+t1;let t3=aa.lo*bb.hi+t2;DD{hi,lo:aa.lo*bb.lo+t3}}
fn div(a:DD,b:DD)->DD{let q=1.0/b.hi;let hi=a.hi*q;let bh=mul(b.hi,-hi);let bl=mul(b.lo,-hi);let eh=(a.hi+bh.hi)+bh.lo;let el=(a.lo+bl.hi)+bl.lo;DD{hi,lo:q*(eh+el)}}
const ATAN:[DD;65]=[
    DD {lo:f64::from_bits(0x0000000000000000),hi:f64::from_bits(0x0000000000000000)},
    DD {lo:f64::from_bits(0xbc2220c39d4dff50),hi:f64::from_bits(0x3f8fff555bbb729b)},
    DD {lo:f64::from_bits(0xbc35ec431444912c),hi:f64::from_bits(0x3f9ffd55bba97625)},
    DD {lo:f64::from_bits(0xbc086ef8f794f105),hi:f64::from_bits(0x3fa7fb818430da2a)},
    DD {lo:f64::from_bits(0xbc3c934d86d23f1d),hi:f64::from_bits(0x3faff55bb72cfdea)},
    DD {lo:f64::from_bits(0x3c5ac4ce285df847),hi:f64::from_bits(0x3fb3f59f0e7c559d)},
    DD {lo:f64::from_bits(0xbc5cfb654c0c3d98),hi:f64::from_bits(0x3fb7ee182602f10f)},
    DD {lo:f64::from_bits(0x3c5f7b8f29a05987),hi:f64::from_bits(0x3fbbe39ebe6f07c3)},
    DD {lo:f64::from_bits(0xbc4cd37686760c17),hi:f64::from_bits(0x3fbfd5ba9aac2f6e)},
    DD {lo:f64::from_bits(0xbc4b485914dacf8c),hi:f64::from_bits(0x3fc1e1fafb043727)},
    DD {lo:f64::from_bits(0x3c661a3b0ce9281b),hi:f64::from_bits(0x3fc3d6eee8c6626c)},
    DD {lo:f64::from_bits(0xbc5054ab2c010f3d),hi:f64::from_bits(0x3fc5c9811e3ec26a)},
    DD {lo:f64::from_bits(0x3c5347b0b4f881ca),hi:f64::from_bits(0x3fc7b97b4bce5b02)},
    DD {lo:f64::from_bits(0x3c4cf601e7b4348e),hi:f64::from_bits(0x3fc9a6a8e96c8626)},
    DD {lo:f64::from_bits(0x3c217b10d2e0e5ab),hi:f64::from_bits(0x3fcb90d7529260a2)},
    DD {lo:f64::from_bits(0x3c6c648d1534597e),hi:f64::from_bits(0x3fcd77d5df205736)},
    DD {lo:f64::from_bits(0x3c68ab6e3cf7afbd),hi:f64::from_bits(0x3fcf5b75f92c80dd)},
    DD {lo:f64::from_bits(0x3c762e47390cb865),hi:f64::from_bits(0x3fd09dc597d86362)},
    DD {lo:f64::from_bits(0x3c630ca4748b1bf9),hi:f64::from_bits(0x3fd18bf5a30bf178)},
    DD {lo:f64::from_bits(0xbc7077cdd36dfc81),hi:f64::from_bits(0x3fd278372057ef46)},
    DD {lo:f64::from_bits(0xbc6963a544b672d8),hi:f64::from_bits(0x3fd362773707ebcc)},
    DD {lo:f64::from_bits(0xbc75d5e43c55b3ba),hi:f64::from_bits(0x3fd44aa436c2af0a)},
    DD {lo:f64::from_bits(0xbc62566480884082),hi:f64::from_bits(0x3fd530ad9951cd4a)},
    DD {lo:f64::from_bits(0xbc7a725715711f00),hi:f64::from_bits(0x3fd614840309cfe2)},
    DD {lo:f64::from_bits(0xbc7c63aae6f6e918),hi:f64::from_bits(0x3fd6f61941e4def1)},
    DD {lo:f64::from_bits(0x3c769c885c2b249a),hi:f64::from_bits(0x3fd7d5604b63b3f7)},
    DD {lo:f64::from_bits(0x3c7b6d0ba3748fa8),hi:f64::from_bits(0x3fd8b24d394a1b25)},
    DD {lo:f64::from_bits(0x3c79e6c988fd0a77),hi:f64::from_bits(0x3fd98cd5454d6b18)},
    DD {lo:f64::from_bits(0xbc724dec1b50b7ff),hi:f64::from_bits(0x3fda64eec3cc23fd)},
    DD {lo:f64::from_bits(0x3c7ae187b1ca5040),hi:f64::from_bits(0x3fdb3a911da65c6c)},
    DD {lo:f64::from_bits(0xbc7cc1ce70934c34),hi:f64::from_bits(0x3fdc0db4c94ec9f0)},
    DD {lo:f64::from_bits(0xbc7a2cfa4418f1ad),hi:f64::from_bits(0x3fdcde53432c1351)},
    DD {lo:f64::from_bits(0x3c7a2b7f222f65e2),hi:f64::from_bits(0x3fddac670561bb4f)},
    DD {lo:f64::from_bits(0x3c70e53dc1bf3435),hi:f64::from_bits(0x3fde77eb7f175a34)},
    DD {lo:f64::from_bits(0xbc6a3992dc382a23),hi:f64::from_bits(0x3fdf40dd0b541418)},
    DD {lo:f64::from_bits(0xbc8b32c949c9d593),hi:f64::from_bits(0x3fe0039c73c1a40c)},
    DD {lo:f64::from_bits(0xbc7d5b495f6349e6),hi:f64::from_bits(0x3fe0657e94db30d0)},
    DD {lo:f64::from_bits(0x3c5974fa13b5404f),hi:f64::from_bits(0x3fe0c6145b5b43da)},
    DD {lo:f64::from_bits(0xbc52bdaee1c0ee35),hi:f64::from_bits(0x3fe1255d9bfbd2a9)},
    DD {lo:f64::from_bits(0x3c8c621cec00c301),hi:f64::from_bits(0x3fe1835a88be7c13)},
    DD {lo:f64::from_bits(0xbc5928df287a668f),hi:f64::from_bits(0x3fe1e00babdefeb4)},
    DD {lo:f64::from_bits(0x3c6c421c9f38224e),hi:f64::from_bits(0x3fe23b71e2cc9e6a)},
    DD {lo:f64::from_bits(0xbc709e73b0c6c087),hi:f64::from_bits(0x3fe2958e59308e31)},
    DD {lo:f64::from_bits(0x3c8c5d5e9ff0cf8d),hi:f64::from_bits(0x3fe2ee628406cbca)},
    DD {lo:f64::from_bits(0x3c81021137c71102),hi:f64::from_bits(0x3fe345f01cce37bb)},
    DD {lo:f64::from_bits(0xbc82304331d8bf46),hi:f64::from_bits(0x3fe39c391cd4171a)},
    DD {lo:f64::from_bits(0x3c7ecf8b492644f0),hi:f64::from_bits(0x3fe3f13fb89e96f4)},
    DD {lo:f64::from_bits(0xbc7f76d0163f79c8),hi:f64::from_bits(0x3fe445065b795b56)},
    DD {lo:f64::from_bits(0x3c72419a87f2a458),hi:f64::from_bits(0x3fe4978fa3269ee1)},
    DD {lo:f64::from_bits(0x3c84a33dbeb3796c),hi:f64::from_bits(0x3fe4e8de5bb6ec04)},
    DD {lo:f64::from_bits(0xbc81bb74abda520c),hi:f64::from_bits(0x3fe538f57b89061f)},
    DD {lo:f64::from_bits(0xbc75e5c9d8c5a950),hi:f64::from_bits(0x3fe587d81f732fbb)},
    DD {lo:f64::from_bits(0x3c60028e4bc5e7ca),hi:f64::from_bits(0x3fe5d58987169b18)},
    DD {lo:f64::from_bits(0xbc62b785350ee8c1),hi:f64::from_bits(0x3fe6220d115d7b8e)},
    DD {lo:f64::from_bits(0xbc76ea6febe8bbba),hi:f64::from_bits(0x3fe66d663923e087)},
    DD {lo:f64::from_bits(0xbc8a80386188c50e),hi:f64::from_bits(0x3fe6b798920b3d99)},
    DD {lo:f64::from_bits(0xbc78c34d25aadef6),hi:f64::from_bits(0x3fe700a7c5784634)},
    DD {lo:f64::from_bits(0x3c47b2a6165884a1),hi:f64::from_bits(0x3fe748978fba8e0f)},
    DD {lo:f64::from_bits(0x3c8406a089803740),hi:f64::from_bits(0x3fe78f6bbd5d315e)},
    DD {lo:f64::from_bits(0x3c8560821e2f3aa9),hi:f64::from_bits(0x3fe7d528289fa093)},
    DD {lo:f64::from_bits(0xbc7bf76229d3b917),hi:f64::from_bits(0x3fe819d0b7158a4d)},
    DD {lo:f64::from_bits(0x3c66b66e7fc8b8c3),hi:f64::from_bits(0x3fe85d69576cc2c5)},
    DD {lo:f64::from_bits(0xbc855b9a5e177a1b),hi:f64::from_bits(0x3fe89ff5ff57f1f8)},
    DD {lo:f64::from_bits(0xbc7ec182ab042f61),hi:f64::from_bits(0x3fe8e17aa99cc05e)},
    DD {lo:f64::from_bits(0x3c81a62633145c07),hi:f64::from_bits(0x3fe921fb54442d18)},
];
fn eval(x:DD)->DD{let sq=x.hi*x.hi;let c0=sq*f64::from_bits(0x3fc999999999999a)+f64::from_bits(0xbfd5555555555555);let c1=sq*f64::from_bits(0x3fbc71c71c71c71c)+f64::from_bits(0xbfc2492492492492);let x3=sq*x.hi;let x4=sq*sq;let d0=x4*c1+c0;let d1=(x4-sq)*x.lo+x.lo;DD{hi:x.hi,lo:x3*d0+d1}}
pub fn atan2(y:f64,x:f64)->f64{
 let xs=x.is_sign_negative();let ys=y.is_sign_negative();let xa=x.to_bits()&0x7fffffffffffffff;let ya=y.to_bits()&0x7fffffffffffffff;
 let recip=xa<ya;let mut mi=if recip{xa}else{ya};let mut ma=if recip{ya}else{xa};let mut me=(mi>>52)as u32;let mut xe=(ma>>52)as u32;let mut n=f64::from_bits(mi);let mut d=f64::from_bits(ma);
 let pi=DD{lo:f64::from_bits(0x3ca1a62633145c07),hi:std::f64::consts::PI};let hpi=DD{lo:f64::from_bits(0x3c91a62633145c07),hi:std::f64::consts::FRAC_PI_2};let qpi=DD{lo:f64::from_bits(0x3c81a62633145c07),hi:std::f64::consts::FRAC_PI_4};let tpi=DD{lo:f64::from_bits(0x3c9a79394c9e8a0a),hi:f64::from_bits(0x4002d97c7f3321d2)};
 if xe>0x7ff-128||me<128 {
  if x.is_nan()||y.is_nan(){return f64::NAN;}let ex=if x==0.0{0}else if x.is_infinite(){2}else{1};let ey=if y==0.0{0}else if y.is_infinite(){2}else{1};
  if ex!=1||ey!=1{let r=if ey==0{if xs{pi}else{DD{lo:0.0,hi:0.0}}}else if ex==0||ey==2&&ex==1{hpi}else if ey==2&&ex==2{if xs{tpi}else{qpi}}else if xs{pi}else{DD{lo:0.0,hi:0.0}};let s=if ys{-1.0}else{1.0};return s*r.hi+s*r.lo;}
  let up=me<128;let down=xe>0x7ff-128;if up{n*=18446744073709551616.0;if !down{d*=18446744073709551616.0;}}else if down{d*=5.421010862427522e-20;if !up{n*=5.421010862427522e-20;}}
  mi=n.to_bits();ma=d.to_bits();me=(mi>>52)as u32;xe=(ma>>52)as u32;
 }
 let s=if(xs!=ys)!=recip{-1.0}else{1.0};let c=if !xs{if recip{DD{hi:-hpi.hi,lo:-hpi.lo}}else{DD{hi:if ys{-0.0}else{0.0},lo:if ys{-0.0}else{0.0}}}}else if recip{hpi}else{DD{hi:-pi.hi,lo:-pi.lo}};
 if xe-me>54{return s*c.hi+s*(c.lo+n/d);}
 let k=(64.0*n/d).round_ties_even();let i=k as usize;let k=k*0.015625;let nk=mul(n,k);let dk=mul(d,k);let nn=sum(n-dk.hi,-dk.lo);let mut dd=sum(d,nk.hi);dd.lo+=nk.lo;let p=eval(div(nn,dd));let r=add(c,add(ATAN[i],p));s*r.hi+s*r.lo
}
pub fn signed(a:f64)->f64{atan2(a.sin(),a.cos())}

// Actual browser canonical binary64 trig. Existing atan2 and signed remain unchanged.
mod browser_trig {
// SPDX-License-Identifier: Apache-2.0 WITH LLVM-exception
// LLVM libc shared sin/cos no-FMA IEEE binary64 round-to-nearest translation.
// Sources: LLVM sin.h, cos.h, sincos_eval.h, range_reduction_double_{common,nofma}.h,
// FPUtil/dyadic_float.h and big_int.h. Copyright LLVM Project contributors.
#[derive(Clone,Copy)]struct DD{lo:f64,hi:f64}
fn sum(a:f64,b:f64)->DD{let hi=a+b;DD{hi,lo:b-(hi-a)}}
fn split(a:f64,n:u32)->DD{let c=(1u64<<n)as f64+1.0;let t1=c*a;let t2=a-t1;let hi=t1+t2;DD{hi,lo:a-hi}}
fn mult(a:f64,b:f64,n:u32)->DD{let aa=split(a,27);let bb=split(b,n);let hi=a*b;let t1=aa.hi*bb.hi-hi;let t2=aa.hi*bb.lo+t1;let t3=aa.lo*bb.hi+t2;DD{hi,lo:aa.lo*bb.lo+t3}}
fn quick_mult(a:DD,b:DD,n:u32)->DD{let mut r=mult(a.hi,b.hi,n);let t1=a.hi*b.lo+r.lo;let t2=a.lo*b.hi+t1;r.lo=t2;r}
const SIN_TABLE:[DD;65]=[DD{lo:f64::from_bits(0x0000000000000000),hi:f64::from_bits(0x0000000000000000)},
DD{lo:f64::from_bits(0x3c5f938a73db97fb),hi:f64::from_bits(0x3f992155f7a3667c)},
DD{lo:f64::from_bits(0xbc2912bd0d569a90),hi:f64::from_bits(0x3fa91f65f10dd814)},
DD{lo:f64::from_bits(0x3c7ccbeeeae8129a),hi:f64::from_bits(0x3fb2d52092ce19f4)},
DD{lo:f64::from_bits(0xbc3e2718d26ed688),hi:f64::from_bits(0x3fb917a6bc29b42c)},
DD{lo:f64::from_bits(0xbc7cbb1f71aca352),hi:f64::from_bits(0x3fbf564e56a97310)},
DD{lo:f64::from_bits(0xbc8dd9ffeaecbdc4),hi:f64::from_bits(0x3fc2c8106e8e613c)},
DD{lo:f64::from_bits(0xbc8ab3802218894f),hi:f64::from_bits(0x3fc5e214448b3fc8)},
DD{lo:f64::from_bits(0xbc849b466e7fe360),hi:f64::from_bits(0x3fc8f8b83c69a60c)},
DD{lo:f64::from_bits(0xbc8035e2873ca432),hi:f64::from_bits(0x3fcc0b826a7e4f64)},
DD{lo:f64::from_bits(0xbc850b7bbc4768b1),hi:f64::from_bits(0x3fcf19f97b215f1c)},
DD{lo:f64::from_bits(0xbc83ed9efaa42ab3),hi:f64::from_bits(0x3fd111d262b1f678)},
DD{lo:f64::from_bits(0x3c9a8b5c974ee7b5),hi:f64::from_bits(0x3fd294062ed59f04)},
DD{lo:f64::from_bits(0x3c94325f12be8946),hi:f64::from_bits(0x3fd4135c94176600)},
DD{lo:f64::from_bits(0x3c8fc2047e54e614),hi:f64::from_bits(0x3fd58f9a75ab1fdc)},
DD{lo:f64::from_bits(0xbc9512c678219317),hi:f64::from_bits(0x3fd7088530fa45a0)},
DD{lo:f64::from_bits(0xbc92e59dba7ab4c2),hi:f64::from_bits(0x3fd87de2a6aea964)},
DD{lo:f64::from_bits(0xbc9d24afdade848b),hi:f64::from_bits(0x3fd9ef7943a8ed8c)},
DD{lo:f64::from_bits(0x3c65b362cb974183),hi:f64::from_bits(0x3fdb5d1009e15cc0)},
DD{lo:f64::from_bits(0xbc9e97af1a63c807),hi:f64::from_bits(0x3fdcc66e9931c460)},
DD{lo:f64::from_bits(0xbc8c3e4edc5872f8),hi:f64::from_bits(0x3fde2b5d3806f63c)},
DD{lo:f64::from_bits(0x3c9fb44f80f92225),hi:f64::from_bits(0x3fdf8ba4dbf89ab8)},
DD{lo:f64::from_bits(0x3ca9697faf2e2fe5),hi:f64::from_bits(0x3fe073879922ffec)},
DD{lo:f64::from_bits(0xbca7bc8eda6af93c),hi:f64::from_bits(0x3fe11eb3541b4b24)},
DD{lo:f64::from_bits(0x3c8b25dd267f6600),hi:f64::from_bits(0x3fe1c73b39ae68c8)},
DD{lo:f64::from_bits(0xbca5769d0fbcddc3),hi:f64::from_bits(0x3fe26d054cdd12e0)},
DD{lo:f64::from_bits(0x3c9c20673b2116b2),hi:f64::from_bits(0x3fe30ff7fce17034)},
DD{lo:f64::from_bits(0x3ca3c7c4bc72a92c),hi:f64::from_bits(0x3fe3affa292050b8)},
DD{lo:f64::from_bits(0xbcae7f895d302395),hi:f64::from_bits(0x3fe44cf325091dd8)},
DD{lo:f64::from_bits(0x3ca13c293edceb32),hi:f64::from_bits(0x3fe4e6cabbe3e5e8)},
DD{lo:f64::from_bits(0xbc875720992bfbb2),hi:f64::from_bits(0x3fe57d69348ceca0)},
DD{lo:f64::from_bits(0xbca24a366a5fe547),hi:f64::from_bits(0x3fe610b7551d2ce0)},
DD{lo:f64::from_bits(0x3c921165f626cdd5),hi:f64::from_bits(0x3fe6a09e667f3bcc)},
DD{lo:f64::from_bits(0xbcabcac43c389ba9),hi:f64::from_bits(0x3fe72d0837efff98)},
DD{lo:f64::from_bits(0xbca21ea6f59be15b),hi:f64::from_bits(0x3fe7b5df226aafb0)},
DD{lo:f64::from_bits(0x3cad217be0e2b971),hi:f64::from_bits(0x3fe83b0e0bff976c)},
DD{lo:f64::from_bits(0x3c969d0f6897664a),hi:f64::from_bits(0x3fe8bc806b151740)},
DD{lo:f64::from_bits(0xbc9615f32b6f907a),hi:f64::from_bits(0x3fe93a22499263fc)},
DD{lo:f64::from_bits(0x3c96788ebcc76dc6),hi:f64::from_bits(0x3fe9b3e047f38740)},
DD{lo:f64::from_bits(0x3caddae89fd441d1),hi:f64::from_bits(0x3fea29a7a0462780)},
DD{lo:f64::from_bits(0xbc9f98273c5d2495),hi:f64::from_bits(0x3fea9b66290ea1a4)},
DD{lo:f64::from_bits(0xbc8926da300ffcce),hi:f64::from_bits(0x3feb090a58150200)},
DD{lo:f64::from_bits(0x3ca90e58336c64a8),hi:f64::from_bits(0x3feb728345196e3c)},
DD{lo:f64::from_bits(0x3ca9f6963354e3fe),hi:f64::from_bits(0x3febd7c0ac6f9528)},
DD{lo:f64::from_bits(0x3c9a47d3a2a0dcbe),hi:f64::from_bits(0x3fec38b2f180bdb0)},
DD{lo:f64::from_bits(0x3c9ed0489e16b9a0),hi:f64::from_bits(0x3fec954b213411f4)},
DD{lo:f64::from_bits(0xbca0f3db5dad5ac5),hi:f64::from_bits(0x3feced7af43cc774)},
DD{lo:f64::from_bits(0x3caac42b5a8b6943),hi:f64::from_bits(0x3fed4134d14dc938)},
DD{lo:f64::from_bits(0xbcad75033dfb9ca8),hi:f64::from_bits(0x3fed906bcf328d48)},
DD{lo:f64::from_bits(0x3c883c37c6107db3),hi:f64::from_bits(0x3feddb13b6ccc23c)},
DD{lo:f64::from_bits(0x3c97f59c49f6cd6d),hi:f64::from_bits(0x3fee212104f686e4)},
DD{lo:f64::from_bits(0x3caee94a90d7b88b),hi:f64::from_bits(0x3fee6288ec48e110)},
DD{lo:f64::from_bits(0xbcaa27d3874701f9),hi:f64::from_bits(0x3fee9f4156c62ddc)},
DD{lo:f64::from_bits(0xbc985f4e1b8298d0),hi:f64::from_bits(0x3feed740e7684964)},
DD{lo:f64::from_bits(0xbc9ab4e148e52d9e),hi:f64::from_bits(0x3fef0a7efb9230d8)},
DD{lo:f64::from_bits(0x3c98a11412b82346),hi:f64::from_bits(0x3fef38f3ac64e588)},
DD{lo:f64::from_bits(0x3c7562172a361fd3),hi:f64::from_bits(0x3fef6297cff75cb0)},
DD{lo:f64::from_bits(0x3ca3564acef1ff97),hi:f64::from_bits(0x3fef8764fa714ba8)},
DD{lo:f64::from_bits(0xbca5e82a3284d5c8),hi:f64::from_bits(0x3fefa7557f08a518)},
DD{lo:f64::from_bits(0xbc9709bccb89a989),hi:f64::from_bits(0x3fefc26470e19fd4)},
DD{lo:f64::from_bits(0x3ca9e082721dfb8e),hi:f64::from_bits(0x3fefd88da3d12524)},
DD{lo:f64::from_bits(0xbcaeade132f3981d),hi:f64::from_bits(0x3fefe9cdad01883c)},
DD{lo:f64::from_bits(0x3cae3a843d1db55f),hi:f64::from_bits(0x3feff621e3796d7c)},
DD{lo:f64::from_bits(0x3c9765595d548d9a),hi:f64::from_bits(0x3feffd886084cd0c)},
DD{lo:f64::from_bits(0x0000000000000000),hi:f64::from_bits(0x3ff0000000000000)}];
const INV_PI:[[f64;4];64]=[[f64::from_bits(0x4040000000000014),f64::from_bits(0x3ce7cc1b727220a8),f64::from_bits(0x39a4fe13abe8fa9c),f64::from_bits(0xb66911f924eb5336)],
[f64::from_bits(0x4040000000145f30),f64::from_bits(0x3ceb727220a94fe0),f64::from_bits(0x39a3abe8fa9a6ee0),f64::from_bits(0x364b6c52b3278872)],
[f64::from_bits(0x404000145f306dc8),f64::from_bits(0x3d0c882a53f84eb0),f64::from_bits(0xb9a70565911f9250),f64::from_bits(0x3664acc9e21c8210)],
[f64::from_bits(0x40445f306dc9c884),f64::from_bits(0xbd05ac07b1505c14),f64::from_bits(0xb9c96447e493ad4c),f64::from_bits(0xb67b0ef1bef806ba)],
[f64::from_bits(0xc03f246c6efab580),f64::from_bits(0xbceec54170565910),f64::from_bits(0xb9af924eb53361e0),f64::from_bits(0x366c820ff28b1d5f)],
[f64::from_bits(0x403391054a7f09d4),f64::from_bits(0x3cff47d4d377036c),f64::from_bits(0x39b8a5664f10e410),f64::from_bits(0x365fe5163abdebbc)],
[f64::from_bits(0x401529fc2757d1f4),f64::from_bits(0x3cd34ddc0db62958),f64::from_bits(0x39993c439041fe50),f64::from_bits(0x36563abdebbc561b)],
[f64::from_bits(0xbfeec54170565910),f64::from_bits(0xbcaf924eb53361e0),f64::from_bits(0x396c820ff28b1d60),f64::from_bits(0xb620a21d4f246dc9)],
[f64::from_bits(0xc04505c1596447e4),f64::from_bits(0xbcf275a99b0ef1c0),f64::from_bits(0x39b07f9458eaf7b0),f64::from_bits(0xb670ea79236e4717)],
[f64::from_bits(0xc00596447e493ad4),f64::from_bits(0xbcb9b0ef1bef806c),f64::from_bits(0x39563abdebbc561c),f64::from_bits(0xb601b7238b7b645a)],
[f64::from_bits(0x404bb81b6c52b328),f64::from_bits(0xbcede37df00d74e4),f64::from_bits(0x39a5ef5de2b0db94),f64::from_bits(0xb66c8e2ded916900)],
[f64::from_bits(0x404b6c52b3278874),f64::from_bits(0xbd0f7c035d38a844),f64::from_bits(0x39c778ac36e48dc8),f64::from_bits(0xb676f6c8b47fe6db)],
[f64::from_bits(0x4042b32788720840),f64::from_bits(0xbcdae9c5421443a8),f64::from_bits(0xb99e48db91c5bdb4),f64::from_bits(0x365d2e006492eea1)],
[f64::from_bits(0xc048778df7c035d4),f64::from_bits(0x3ced5ef5de2b0db8),f64::from_bits(0x39a2371d2126e970),f64::from_bits(0x35f924bba8274648)],
[f64::from_bits(0xc03bef806ba71508),f64::from_bits(0xbcd443a9e48db91c),f64::from_bits(0xb976f6c8b47fe6dc),f64::from_bits(0x36277504e8c90e7f)],
[f64::from_bits(0xbfdae9c5421443a8),f64::from_bits(0xbc9e48db91c5bdb4),f64::from_bits(0x395d2e006492eea0),f64::from_bits(0x3603a32439fc3bd6)],
[f64::from_bits(0xc0438a84288753c8),f64::from_bits(0xbd01b7238b7b645c),f64::from_bits(0x39cc00c925dd413c),f64::from_bits(0xb68cdbc603c429c7)],
[f64::from_bits(0xc020a21d4f246dc8),f64::from_bits(0xbcdc5bdb22d1ff9c),f64::from_bits(0x39825dd413a32438),f64::from_bits(0x364fc3bd63962535)],
[f64::from_bits(0xc02d4f246dc8e2e0),f64::from_bits(0x3ce26e9700324978),f64::from_bits(0xb995f62e6de301e4),f64::from_bits(0x365eb1cb129a73ef)],
[f64::from_bits(0xc03236e4716f6c8c),f64::from_bits(0x3ce7003249775050),f64::from_bits(0xb9a736f180f10a70),f64::from_bits(0xb66a76b2c608bbee)],
[f64::from_bits(0x403b8e909374b800),f64::from_bits(0x3cf924bba8274648),f64::from_bits(0x399cfe1deb1cb128),f64::from_bits(0x365a73ee88235f53)],
[f64::from_bits(0x40309374b801924c),f64::from_bits(0xbcd15f62e6de3020),f64::from_bits(0x399deb1cb129a740),f64::from_bits(0xb65177dca0ad144c)],
[f64::from_bits(0xc0268ffcdb688afc),f64::from_bits(0x3cdd1921cfe1deb0),f64::from_bits(0x399cb129a73ee884),f64::from_bits(0xb65ca0ad144bb7b1)],
[f64::from_bits(0x3ff924bba8274648),f64::from_bits(0x3c9cfe1deb1cb128),f64::from_bits(0x395a73ee88235f54),f64::from_bits(0xb61144bb7b166390)],
[f64::from_bits(0xc04a22bec5cdbc60),f64::from_bits(0xbcde214e34ed658c),f64::from_bits(0xb95177dca0ad144c),f64::from_bits(0x35f213a671c09ad1)],
[f64::from_bits(0x4003a32439fc3bd8),f64::from_bits(0xbccc69dacb1822f0),f64::from_bits(0x3961afa975da2428),f64::from_bits(0xb616638fd94ba082)],
[f64::from_bits(0xc03b78c0788538d4),f64::from_bits(0x3cd29a73ee882360),f64::from_bits(0xb985a28976f62cc8),f64::from_bits(0x363c09ad17df904e)],
[f64::from_bits(0x404fc3bd63962534),f64::from_bits(0x3cfcfba208d7d4bc),f64::from_bits(0xb9b12edec598e3f8),f64::from_bits(0x367ad17df904e647)],
[f64::from_bits(0xc014e34ed658c118),f64::from_bits(0x3cc046bea5d76890),f64::from_bits(0x3973a671c09ad17c),f64::from_bits(0x363f904e64758e61)],
[f64::from_bits(0x40462534e7dd1048),f64::from_bits(0xbd0415a28976f62c),f64::from_bits(0xb9b8e3f652e82070),f64::from_bits(0x3653991d63983534)],
[f64::from_bits(0xc0363045df7282b4),f64::from_bits(0xbcd44bb7b16638fc),f64::from_bits(0xb9994ba081bec670),f64::from_bits(0x365d639835339f4a)],
[f64::from_bits(0x404d1046bea5d768),f64::from_bits(0x3cf213a671c09ad0),f64::from_bits(0x39b7df904e647590),f64::from_bits(0xb679f2b3182d8def)],
[f64::from_bits(0x402afa975da24274),f64::from_bits(0x3cd9c7026b45f7e4),f64::from_bits(0x3953991d63983534),f64::from_bits(0xb5f82d8dee81d108)],
[f64::from_bits(0xc04a28976f62cc70),f64::from_bits(0xbd0fb29741037d8c),f64::from_bits(0xb9bb8a719f2b3184),f64::from_bits(0x367272117e2ef7e5)],
[f64::from_bits(0xc0476f62cc71fb28),f64::from_bits(0xbd0741037d8cdc54),f64::from_bits(0x39acc1a99cfa4e44),f64::from_bits(0xb66d03a21036be27)],
[f64::from_bits(0x404d338e04d68bf0),f64::from_bits(0xbcdbec66e29c67cc),f64::from_bits(0x399339f49c845f8c),f64::from_bits(0xb63081b5f13801da)],
[f64::from_bits(0x403c09ad17df9050),f64::from_bits(0xbcf9b8a719f2b318),f64::from_bits(0xb986c6f740e8840c),f64::from_bits(0xb64af89c00ed0004)],
[f64::from_bits(0x40468befc827323c),f64::from_bits(0xbd038cf9598c16c8),f64::from_bits(0x39c08bf177bf2508),f64::from_bits(0xb673801da00087ea)],
[f64::from_bits(0xc04037d8cdc538d0),f64::from_bits(0x3cea99cfa4e422fc),f64::from_bits(0x39877bf250763ff0),f64::from_bits(0x3642fffbc0b301fe)],
[f64::from_bits(0xc048cdc538cf9598),f64::from_bits(0xbcf82d8dee81d108),f64::from_bits(0xb97b5f13801da000),f64::from_bits(0xb620fd33f8086877)],
[f64::from_bits(0xc024e33e566305b0),f64::from_bits(0xbcebdd03a21036c0),f64::from_bits(0x39ad8ffc4bffef04),f64::from_bits(0xb6633f80868773a5)],
[f64::from_bits(0xc03f2b3182d8dee8),f64::from_bits(0xbcbd1081b5f13800),f64::from_bits(0xb97da00087e99fc0),f64::from_bits(0xb610d0ee74a5f593)],
[f64::from_bits(0xc048c16c6f740e88),f64::from_bits(0xbce036be27003b40),f64::from_bits(0xb920fd33f8086878),f64::from_bits(0x35d8b5a0a6d1f6d3)],
[f64::from_bits(0x4043908bf177bf24),f64::from_bits(0x3d00763ff12fffbc),f64::from_bits(0x3976603fbcbc462c),f64::from_bits(0x3636829b47db4da0)],
[f64::from_bits(0x4037e2ef7e4a0ec8),f64::from_bits(0xbc7da00087e99fc0),f64::from_bits(0xb910d0ee74a5f594),f64::from_bits(0x35d1f6d367ecf27d)],
[f64::from_bits(0xc03081b5f13801dc),f64::from_bits(0x3cffff7816603fbc),f64::from_bits(0x39a788c5ad053690),f64::from_bits(0xb6425930261b069f)],
[f64::from_bits(0xc04af89c00ed0004),f64::from_bits(0xbcdfa67f010d0ee8),f64::from_bits(0x3986b414da3eda6c),f64::from_bits(0x363fb3c9f2c26dd4)],
[f64::from_bits(0xc04c00ed00043f4c),f64::from_bits(0xbcffc04343b9d298),f64::from_bits(0x3984da3eda6cfda0),f64::from_bits(0xb64b069ec9161738)],
[f64::from_bits(0x4042fffbc0b301fc),f64::from_bits(0x3d0e5e2316b414dc),f64::from_bits(0xb9cc125930261b08),f64::from_bits(0x3686136e9e8c7ecd)],
[f64::from_bits(0xc020fd33f8086878),f64::from_bits(0x3cd8b5a0a6d1f6d4),f64::from_bits(0xb9830261b069ec90),f64::from_bits(0xb6461738132c3403)],
[f64::from_bits(0xc039fc04343b9d28),f64::from_bits(0xbcf7d64b824b2604),f64::from_bits(0xb9a86c1a7b24585c),f64::from_bits(0xb65c09961a015d29)],
[f64::from_bits(0xc010d0ee74a5f594),f64::from_bits(0x3cd1f6d367ecf27c),f64::from_bits(0x3986136e9e8c7ecc),f64::from_bits(0x3643cbfd45aea4f7)],
[f64::from_bits(0xc04dce94beb25c14),f64::from_bits(0x3d0a6cfd9e4f9614),f64::from_bits(0xb9b22c2e70265868),f64::from_bits(0xb615d28ad8453814)],
[f64::from_bits(0xc044beb25c125930),f64::from_bits(0xbcd30d834f648b0c),f64::from_bits(0x3978fd9a797fa8b4),f64::from_bits(0x363d49eeb1faf97c)],
[f64::from_bits(0x403b47db4d9fb3c8),f64::from_bits(0x3cff2c26dd3d18fc),f64::from_bits(0x39b9a797fa8b5d48),f64::from_bits(0x367eeb1faf97c5ed)],
[f64::from_bits(0xc0425930261b06a0),f64::from_bits(0x3d036e9e8c7ecd3c),f64::from_bits(0x39b7fa8b5d49eeb0),f64::from_bits(0x367faf97c5ecf41d)],
[f64::from_bits(0x403fb3c9f2c26dd4),f64::from_bits(0xbcc738132c3402bc),f64::from_bits(0x398aea4f758fd7cc),f64::from_bits(0xb60d0985f18c10eb)],
[f64::from_bits(0xc04b069ec9161738),f64::from_bits(0xbcc32c3402ba515c),f64::from_bits(0x397eeb1faf97c5ec),f64::from_bits(0x362e839cfbc52949)],
[f64::from_bits(0xc04ec9161738132c),f64::from_bits(0xbcda015d28ad8454),f64::from_bits(0x397faf97c5ecf41c),f64::from_bits(0x362cfbc529497536)],
[f64::from_bits(0xc0461738132c3404),f64::from_bits(0x3d045aea4f758fd8),f64::from_bits(0xb99a0e84c2f8c608),f64::from_bits(0xb63d6b5b45650128)],
[f64::from_bits(0x402fb34f2ff516bc),f64::from_bits(0xbce6c229c0a0d074),f64::from_bits(0xb9730be31821d6b4),f64::from_bits(0xb63b4565012813b8)],
[f64::from_bits(0x4043cbfd45aea4f8),f64::from_bits(0xbcf4e050683a130c),f64::from_bits(0x397ce7de294a4ba8),f64::from_bits(0x363afed7ec47e357)],
[f64::from_bits(0xc015d28ad8453814),f64::from_bits(0xbc9a0e84c2f8c608),f64::from_bits(0xb93d6b5b45650128),f64::from_bits(0xb5b3b81ca8bdea7f)],
[f64::from_bits(0xc0415b08a7028340),f64::from_bits(0xbd0d0985f18c10ec),f64::from_bits(0x39b4a4ba9afed7ec),f64::from_bits(0x3651f8d5d0856033)]];
fn lookup(k:u32)->DD{let i=if k&64!=0{64-(k&63)}else{k&63};let r=SIN_TABLE[i as usize];if k&128!=0{DD{hi:-r.hi,lo:-r.lo}}else{r}}
fn small(x:f64)->(u32,DD){let prod=x*f64::from_bits(0x40445f306dc9c883);let kd=prod.round_ties_even();let hi0=kd*(-f64::from_bits(0x3f9921fb54400000))+x;let hi=kd*(-f64::from_bits(0x3d70b4611a600000))+hi0;let u0=hi0-hi;let u1=kd*(-f64::from_bits(0x3d70b4611a600000))+u0;let lo=kd*(-f64::from_bits(0x3b43198a2e037073))+u1;(kd as i64 as u32,DD{hi,lo})}
#[derive(Clone,Copy)]struct Large{index:usize,x:f64,hi:f64,mid:DD,lo:f64}
fn large(x:f64)->(u32,DD,Large){let bits=x.to_bits();let e=((bits>>52)&2047)as i32-1085;let index=((e>>4)+3)as usize;let reduced=f64::from_bits((bits&0x800fffffffffffff)|((((e&15)+1085)as u64)<<52));let c=INV_PI[index];let ph=mult(reduced,c[0],28);let pm=mult(reduced,c[1],28);let pl=mult(reduced,c[2],28);let kd=(ph.lo+pm.hi).round_ties_even();let hi=(ph.lo-kd)+pm.hi;let mid=sum(pm.lo,pl.hi);let lo=pl.lo;let yl=reduced*c[3]+lo;let mut y=sum(hi,mid.hi);y.lo+=mid.lo+yl;let u=quick_mult(y,DD{lo:f64::from_bits(0x3c31a62633145c07),hi:f64::from_bits(0x3f9921fb54442d18)},28);(kd as i64 as u32,u,Large{index,x:reduced,hi,mid,lo})}
fn eval(u:DD)->(DD,DD,f64){let sq=u.hi*u.hi;let p1=sq*(-f64::from_bits(0x3f2a01a01a01a01a))+f64::from_bits(0x3f81111111111111);let q1=sq*f64::from_bits(0x3fa5555555555555)-0.5;let u3=sq*u.hi;let p2=sq*p1-f64::from_bits(0x3fc5555555555555);let q2=sq*q1+1.0;let sinlo=u3*p2+u.lo*q2;let prod=mult(u.hi,-0.5*u.hi,27);let mut v=sum(1.0,prod.hi);v.lo+=prod.lo;let r1=sq*f64::from_bits(0x3efa01a01a01a01a)-f64::from_bits(0x3f56c16c16c16c17);let s1=sq*f64::from_bits(0x3fc5555555555555)-1.0;let u4=sq*sq;let cross=u.hi*u.lo;let r2=sq*r1+f64::from_bits(0x3fa5555555555555);let s2=cross*s1+v.lo;let coslo=u4*r2+s2;(sum(u.hi,sinlo),sum(v.hi,coslo),u3.abs()*f64::from_bits(0x3cc0000000000000)+f64::from_bits(0x3960000000000000))}
#[derive(Clone,Copy)]struct D128{negative:bool,exponent:i32,mantissa:u128}
impl D128{const fn new(negative:bool,exponent:i32,mantissa:u128)->Self{if mantissa==0{return Self{negative,exponent,mantissa};}let n=mantissa.leading_zeros();Self{negative,exponent:exponent-n as i32,mantissa:mantissa<<n}}
fn from_f64(x:f64)->Self{let bits=x.to_bits();let biased=((bits>>52)&2047)as i32;let mantissa=bits&0xfffffffffffff;Self::new(bits>>63!=0,if biased==0{-1074}else{biased-1075},if biased==0{mantissa as u128}else{(mantissa|1u64<<52)as u128})}
fn negate(self)->Self{Self{negative:!self.negative,..self}}
fn to_f64(self)->f64{let sign=(self.negative as u64)<<63;if self.mantissa==0{return f64::from_bits(sign);}let unbiased=self.exponent+127;let shift=if unbiased>=-1022{75}else{-1074-self.exponent};if shift>128{return f64::from_bits(sign);}let(mut mantissa,round,sticky)=if shift==128{(0u64,self.mantissa>>127!=0,self.mantissa&((1u128<<127)-1)!=0)}else if shift>0{let rb=1u128<<(shift-1);((self.mantissa>>shift)as u64,self.mantissa&rb!=0,self.mantissa&(rb-1)!=0)}else{(self.mantissa as u64,false,false)};if round&&(sticky||mantissa&1!=0){mantissa+=1;}if unbiased>=-1022{let exponent=(unbiased+1023)as u64;f64::from_bits(sign|((exponent<<52)+(mantissa-(1u64<<52))))}else{f64::from_bits(sign|mantissa)}}}
fn add128(mut a:D128,mut b:D128)->D128{if a.mantissa==0{return b;}if b.mantissa==0{return a;}if a.exponent>b.exponent{let n=(a.exponent-b.exponent)as u32;b.mantissa=if n<128{b.mantissa>>n}else{0};b.exponent=a.exponent;}else if b.exponent>a.exponent{let n=(b.exponent-a.exponent)as u32;a.mantissa=if n<128{a.mantissa>>n}else{0};a.exponent=b.exponent;}if a.negative==b.negative{let(m,carry)=a.mantissa.overflowing_add(b.mantissa);if carry{return D128{negative:a.negative,exponent:a.exponent+1,mantissa:(m>>1)|(1u128<<127)};}return D128{negative:a.negative,exponent:a.exponent,mantissa:m};}if a.mantissa>=b.mantissa{D128::new(a.negative,a.exponent,a.mantissa-b.mantissa)}else{D128::new(b.negative,b.exponent,b.mantissa-a.mantissa)}}
fn mul128(a:D128,b:D128)->D128{let al=a.mantissa as u64 as u128;let ah=a.mantissa>>64;let bl=b.mantissa as u64 as u128;let bh=b.mantissa>>64;let(cross,carry)= (al*bh).overflowing_add(ah*bl);let mantissa=ah*bh+(cross>>64)+((carry as u128)<<64);let mut r=D128{negative:a.negative!=b.negative,exponent:a.exponent+b.exponent+128,mantissa};if r.mantissa!=0&&r.mantissa>>127==0{r.mantissa<<=1;r.exponent-=1;}r}
const PRECISE_TABLE:[D128;65]=[D128::new(false,0,0u128),
D128::new(false,-133,0xc90aafbd1b33efc9c539edcbfda0cf2cu128),
D128::new(false,-132,0xc8fb2f886ec09f376a17954b2b7c5171u128),
D128::new(false,-131,0x96a9049670cfae65f77574094d3c35c4u128),
D128::new(false,-131,0xc8bd35e14da15f0ec7396c894bbf7389u128),
D128::new(false,-131,0xfab272b54b9871a2704729ae56d78a37u128),
D128::new(false,-130,0x964083747309d113000a89a11e07c1feu128),
D128::new(false,-130,0xaf10a22459fe32a63feef3bb58b1f10du128),
D128::new(false,-130,0xc7c5c1e34d3055b25cc8c00e4fccd850u128),
D128::new(false,-130,0xe05c1353f27b17e50ebc61ade6ca83cdu128),
D128::new(false,-130,0xf8cfcbd90af8d57a4221dc4ba772598du128),
D128::new(false,-129,0x888e93158fb3bb04984156f553344306u128),
D128::new(false,-129,0x94a03176acf82d45ae4ba773da6bf754u128),
D128::new(false,-129,0xa09ae4a0bb300a192f895f44a303cc0bu128),
D128::new(false,-129,0xac7cd3ad58fee7f0811f953984eff83eu128),
D128::new(false,-129,0xb8442987d22cf5769cc3ef36746de3b8u128),
D128::new(false,-129,0xc3ef1535754b168d3122c2a59efddc37u128),
D128::new(false,-129,0xcf7bca1d476c516da81290bdbaad62e4u128),
D128::new(false,-129,0xdae8804f0ae6015b362cb974182e3030u128),
D128::new(false,-129,0xe63374c98e22f0b42872ce1bfc7ad1cdu128),
D128::new(false,-129,0xf15ae9c037b1d8f06c48e9e3420b0f1eu128),
D128::new(false,-129,0xfc5d26dfc4d5cfda27c07c911290b8d1u128),
D128::new(false,-128,0x839c3cc917ff6cb4bfd79717f2880abfu128),
D128::new(false,-128,0x88f59aa0da591421b892ca8361d8c84cu128),
D128::new(false,-128,0x8e39d9cd73464364bba4cfecbff54867u128),
D128::new(false,-128,0x93682a66e896f544b17821911e71c16eu128),
D128::new(false,-128,0x987fbfe70b81a70819cec845ac87a5c6u128),
D128::new(false,-128,0x9d7fd1490285c9e3e25e39549638ae68u128),
D128::new(false,-128,0xa267992848eeb0c03b5167ee359a234eu128),
D128::new(false,-128,0xa73655df1f2f489e149f6e75993468a3u128),
D128::new(false,-128,0xabeb49a46764fd151becda8089c1a94cu128),
D128::new(false,-128,0xb085baa8e966f6dae4cad00d5c94bcd2u128),
D128::new(false,-128,0xb504f333f9de6484597d89b3754abe9fu128),
D128::new(false,-128,0xb96841bf7ffcb21a9de1e3b22b8bf4dbu128),
D128::new(false,-128,0xbdaef913557d76f0ac85320f528d6d5du128),
D128::new(false,-128,0xc1d8705ffcbb6e90bdf0715cb8b20bd7u128),
D128::new(false,-128,0xc5e40358a8ba05a743da25d99267326bu128),
D128::new(false,-128,0xc9d1124c931fda7a8335241be1693225u128),
D128::new(false,-128,0xcd9f023f9c3a059e23af31db7179a4aau128),
D128::new(false,-128,0xd14d3d02313c0eed744fea20e8abef92u128),
D128::new(false,-128,0xd4db3148750d1819f630e8b6dac83e69u128),
D128::new(false,-128,0xd84852c0a80ffcdb24b9fe00663574a4u128),
D128::new(false,-128,0xdb941a28cb71ec872c19b63253da43fcu128),
D128::new(false,-128,0xdebe05637ca94cfb4b19aa71fec3ae6du128),
D128::new(false,-128,0xe1c5978c05ed8691f4e8a8372f8c5810u128),
D128::new(false,-128,0xe4aa5909a08fa7b4122785ae67f5515du128),
D128::new(false,-128,0xe76bd7a1e63b9786125129529d48a92fu128),
D128::new(false,-128,0xea09a68a6e49cd6215ad45b4a1b5e823u128),
D128::new(false,-128,0xec835e79946a31457e610231ac1d6181u128),
D128::new(false,-128,0xeed89db66611e30786f8c20fb664b01bu128),
D128::new(false,-128,0xf1090827b43725fd67127db35b287316u128),
D128::new(false,-128,0xf314476247088f74a5486bdc455d56a2u128),
D128::new(false,-128,0xf4fa0ab6316ed2ec163c5c7f03b718c5u128),
D128::new(false,-128,0xf6ba073b424b19e82c791f59cc1ffc23u128),
D128::new(false,-128,0xf853f7dc9186b952c7adc6b4988891bbu128),
D128::new(false,-128,0xf9c79d63272c46284504ae08d19b2980u128),
D128::new(false,-128,0xfb14be7fbae581562172a361fd2a722fu128),
D128::new(false,-128,0xfc3b27d38a5d49ab256778ffcb5c1769u128),
D128::new(false,-128,0xfd3aabf84528b50beae6bd951c1dabbeu128),
D128::new(false,-128,0xfe1323870cfe9a3d90cd1d959db674efu128),
D128::new(false,-128,0xfec46d1e89292cf041390efdc726e9efu128),
D128::new(false,-128,0xff4e6d680c41d0a90f668633f1ab858au128),
D128::new(false,-128,0xffb10f1bcb6bef1d421e8edaaf59453eu128),
D128::new(false,-128,0xffec4304266865d95657552366961732u128),
D128::new(false,0,1u128)];
const SIN_COEFF:[D128;7]=[D128::new(false,-127,0x80000000000000000000000000000000u128),
D128::new(true,-130,0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabu128),
D128::new(false,-134,0x88888888888888888888888888888889u128),
D128::new(true,-140,0xd00d00d00d00d00d00d00d00d00d00d0u128),
D128::new(false,-146,0xb8ef1d2ab6399c7d560e4472800b8ef2u128),
D128::new(true,-153,0xd7322b3faa271c7f3a3f25c1bee38f10u128),
D128::new(false,-160,0xb092309d43684be51c198e91d7b4269eu128)];
const COS_COEFF:[D128;7]=[D128::new(false,-127,0x80000000000000000000000000000000u128),
D128::new(true,-128,0x80000000000000000000000000000000u128),
D128::new(false,-132,0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabu128),
D128::new(true,-137,0xb60b60b60b60b60b60b60b60b60b60b6u128),
D128::new(false,-143,0xd00d00d00d00d00d00d00d00d00d00d0u128),
D128::new(true,-149,0x93f27dbbc4fae397780b69f5333c725bu128),
D128::new(false,-156,0x8f76c77fc6c4bdaa26d4c3d67f425f60u128)];
fn precise_lookup(k:u32)->D128{let i=if k&64!=0{64-(k&63)}else{k&63};let r=PRECISE_TABLE[i as usize];if k&128!=0{r.negate()}else{r}}
fn poly128(x:D128,c:&[D128;7])->D128{let mut r=c[6];for i in(0..6).rev(){r=add128(c[i],mul128(x,r));}r}
fn precise(x:f64,k:u32,cosine:bool,reduction:Option<Large>)->f64{let pi=D128::new(false,-133,0xc90fdaa22168c234c4c6628b80dc1cd1u128);let u=if let Some(r)=reduction{let lo0=D128::from_f64(r.x*INV_PI[r.index][3]);let lo1=add128(D128::from_f64(r.lo),lo0);let mid=add128(D128::from_f64(r.mid.lo),lo1);let hi=add128(D128::from_f64(r.hi),D128::from_f64(r.mid.hi));mul128(add128(hi,mid),pi)}else{let kd=(x*f64::from_bits(0x40445f306dc9c883)).round_ties_even();let dx=D128::from_f64(x);let p0=mul128(dx,D128::from_f64(INV_PI[3][0]));let p1=mul128(dx,D128::from_f64(INV_PI[3][1]));let p2=mul128(dx,D128::from_f64(INV_PI[3][2]));let hi=add128(p0,D128::from_f64(-kd));let lo=add128(p1,p2);mul128(add128(hi,lo),pi)};let sq=mul128(u,u);let su=mul128(u,poly128(sq,&SIN_COEFF));let cu=poly128(sq,&COS_COEFF);let r=if cosine{add128(mul128(precise_lookup(k.wrapping_add(64)),cu),mul128(precise_lookup(k.wrapping_add(128)),su))}else{add128(mul128(precise_lookup(k),cu),mul128(precise_lookup(k.wrapping_add(64)),su))};r.to_f64()}
fn trig(x:f64,cosine:bool)->f64{if !x.is_finite(){return f64::NAN;}let ax=x.abs();if ax<0.0625{if cosine{if ax<2f64.powi(-27){return 1.0;}let sq=x*x;let c0=sq*f64::from_bits(0x3fa5555555555262)-0.5;let c1=sq*f64::from_bits(0x3efa00ffd769159a)-f64::from_bits(0x3f56c16c1508bff1);let x4=sq*sq;let lo=(x4*c1+c0)*sq;let err=sq*f64::from_bits(0x3cc0000000000000)+f64::from_bits(0x3ba0000000000000);let up=1.0+(lo+err);let down=1.0+(lo-err);if up==down{return up;}}else{if x==0.0{return x+x;}if ax<2f64.powi(-26){return x*(-f64::from_bits(0x3c90000000000000))+x;}let sq=x*x;let c0=sq*f64::from_bits(0x3f8111111110f491)-f64::from_bits(0x3fc5555555555555);let c1=sq*f64::from_bits(0x3ec71c24233f1baf)-f64::from_bits(0x3f2a01a00e16af3e);let x4=sq*sq;let x3=x*sq;let lo=(x4*c1+c0)*x3;let err=sq*f64::from_bits(0x3cb0000000000000)+f64::from_bits(0x3bb0000000000000);let up=x+(x*err+lo);let down=x+(-x*err+lo);if up==down{return up;}}let(k,_)=small(x);return precise(x,k,cosine,None);}
let(k,u,reduction)=if ax<65536.0{let(k,u)=small(x);(k,u,None)}else{let(k,u,r)=large(x);(k,u,Some(r))};let(s,c,e)=eval(u);let(a,b)=if cosine{(quick_mult(c,lookup(k.wrapping_add(64)),27),quick_mult(s,lookup(k.wrapping_add(128)),27))}else{(quick_mult(c,lookup(k),27),quick_mult(s,lookup(k.wrapping_add(64)),27))};let mut r=sum(a.hi,b.hi);if cosine{r.lo+=b.lo+a.lo;}else{r.lo+=a.lo+b.lo;}let up=r.hi+(r.lo+e);let down=r.hi+(r.lo-e);if up==down{up}else{precise(x,k,cosine,reduction)}}
pub fn sin(x:f64)->f64{trig(x,false)}
pub fn cos(x:f64)->f64{trig(x,true)}

}
pub fn sin(x:f64)->f64{browser_trig::sin(x)}
pub fn cos(x:f64)->f64{browser_trig::cos(x)}
